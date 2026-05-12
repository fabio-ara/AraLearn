package com.aralearn.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String APP_URL =
        "https://appassets.androidplatform.net/assets/www/public/index.html";
    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final int REQUEST_EXPORT_DOCUMENT = 1002;
    private static final String DEFAULT_EXPORT_NAME = "aralearn-export.json";
    private static final String DEFAULT_EXPORT_MIME = "application/json";
    private static final int MAX_SHARED_IMPORT_BYTES = 5 * 1024 * 1024;
    private static final int WEBVIEW_PLATFORM_INSETS_MILESTONE = 140;
    private static final String BACK_PRESS_SCRIPT =
        "(function(){try{return !!(window.AraLearnAndroid && " +
        "window.AraLearnAndroid.handleBackPress && " +
        "window.AraLearnAndroid.handleBackPress());}catch(_error){return false;}})();";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PendingDocumentWrite pendingExport;
    private WebViewAssetLoader assetLoader;
    private InsetCapabilities insetCapabilities = new InsetCapabilities(false, 0);
    private String pendingSharedImportText;
    private String pendingSharedImportSourceName;

    private static final class PendingDocumentWrite {
        final byte[] bytes;
        final String fileName;
        final String mimeType;

        PendingDocumentWrite(byte[] bytes, String fileName, String mimeType) {
            this.bytes = bytes;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }

    private static final class InsetCapabilities {
        final boolean usesPlatformInsets;
        final int webViewMajorVersion;

        InsetCapabilities(
            boolean usesPlatformInsets,
            int webViewMajorVersion
        ) {
            this.usesPlatformInsets = usesPlatformInsets;
            this.webViewMajorVersion = webViewMajorVersion;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.main_webview);
        insetCapabilities = detectInsetCapabilities();
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        configureWebView();
        configureInsetsHandling();
        WebView.setWebContentsDebuggingEnabled(isDebuggableApp());

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        captureSharedImportIntent(getIntent());
        flushPendingSharedImportToWebView();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureSharedImportIntent(intent);
        flushPendingSharedImportToWebView();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        clearFilePathCallback();

        if (webView != null) {
            webView.removeJavascriptInterface("AndroidHost");
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(BACK_PRESS_SCRIPT, value -> {
            if (!"true".equals(value)) {
                MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_FILE_CHOOSER) {
            ValueCallback<Uri[]> callback = filePathCallback;
            filePathCallback = null;
            if (callback != null) {
                callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            }
            return;
        }

        if (requestCode == REQUEST_EXPORT_DOCUMENT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                savePendingExport(data.getData());
            } else {
                pendingExport = null;
            }
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.addJavascriptInterface(new AndroidHostBridge(), "AndroidHost");
        webView.setWebViewClient(new AraLearnWebViewClient());
        webView.setWebChromeClient(new AraLearnWebChromeClient());
    }

    private void clearFilePathCallback() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
    }

    private void configureInsetsHandling() {
        if (webView == null) return;

        if (insetCapabilities.usesPlatformInsets) {
            webView.setPadding(0, 0, 0, 0);
            return;
        }

        installLegacyInsetsFallback();
    }

    private void installLegacyInsetsFallback() {
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            if (windowInsets == null) return WindowInsetsCompat.CONSUMED;

            Insets systemBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets gestures = windowInsets.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures());

            int left = Math.max(0, systemBars.left);
            int top = Math.max(0, systemBars.top);
            int right = Math.max(0, systemBars.right);
            int bottom = Math.max(0, Math.max(systemBars.bottom, gestures.bottom));

            // Fallback legado: compensa a WebView por fora e zera os insets entregues ao conteúdo.
            view.setPadding(left, top, right, bottom);

            WindowInsetsCompat.Builder passthrough = new WindowInsetsCompat.Builder(windowInsets);
            passthrough.setInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                Insets.NONE
            );
            passthrough.setInsets(WindowInsetsCompat.Type.mandatorySystemGestures(), Insets.NONE);
            return passthrough.build();
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private InsetCapabilities detectInsetCapabilities() {
        PackageInfo currentPackage = WebViewCompat.getCurrentWebViewPackage(this);
        int webViewMajorVersion = parseWebViewMajorVersion(currentPackage != null ? currentPackage.versionName : null);
        boolean usesPlatformInsets = webViewMajorVersion >= WEBVIEW_PLATFORM_INSETS_MILESTONE;
        return new InsetCapabilities(usesPlatformInsets, webViewMajorVersion);
    }

    private int parseWebViewMajorVersion(String versionName) {
        if (versionName == null || versionName.isEmpty()) {
            return 0;
        }

        int separatorIndex = versionName.indexOf('.');
        String majorToken = separatorIndex >= 0 ? versionName.substring(0, separatorIndex) : versionName;
        try {
            return Math.max(0, Integer.parseInt(majorToken));
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private void openExportDocument(PendingDocumentWrite exportData) {
        pendingExport = exportData;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(exportData.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, exportData.fileName);

        try {
            startActivityForResult(intent, REQUEST_EXPORT_DOCUMENT);
        } catch (ActivityNotFoundException error) {
            pendingExport = null;
            showToast(getString(R.string.export_unavailable));
        }
    }

    private void savePendingExport(Uri uri) {
        PendingDocumentWrite exportData = pendingExport;
        pendingExport = null;
        if (exportData == null) return;

        try {
            writeBytesToUri(uri, exportData.bytes);
            showToast(getString(R.string.export_success, exportData.fileName));
        } catch (IOException error) {
            showToast(getString(R.string.export_error));
        }
    }

    private void writeBytesToUri(Uri uri, byte[] bytes) throws IOException {
        try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new IOException("Destino indisponível.");
            output.write(bytes);
            output.flush();
        }
    }

    private String sanitizeFileName(String value, String fallback) {
        String raw = value == null ? "" : value.trim();
        if (raw.isEmpty()) return fallback;

        String cleaned = raw.replaceAll("[\\\\/:*?\"<>|]+", "_");
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    private String sanitizeMimeType(String value) {
        String raw = value == null ? "" : value.trim();
        return raw.isEmpty() ? DEFAULT_EXPORT_MIME : raw;
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
    }

    private void captureSharedImportIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            captureSharedImportFromUri(intent, intent.getData());
            return;
        }

        if (Intent.ACTION_SEND.equals(action)) {
            Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (streamUri != null) {
                captureSharedImportFromUri(intent, streamUri);
                return;
            }

            CharSequence sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (sharedText != null) {
                queueSharedImportText(sharedText.toString(), resolveSharedSourceName(intent, null));
                markSharedImportIntentConsumed(intent);
            }
            return;
        }

        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) {
                for (Uri candidate : streams) {
                    if (candidate == null) {
                        continue;
                    }
                    if (captureSharedImportFromUri(intent, candidate)) {
                        return;
                    }
                }
            }

            showToast(getString(R.string.shared_import_unreadable));
        }
    }

    private boolean captureSharedImportFromUri(Intent intent, Uri uri) {
        if (uri == null) {
            return false;
        }

        try {
            queueSharedImportText(readTextFromUri(uri), resolveSharedSourceName(intent, uri));
            markSharedImportIntentConsumed(intent);
            return true;
        } catch (SharedImportTooLargeException error) {
            showToast(getString(R.string.shared_import_too_large));
            return false;
        } catch (IOException error) {
            showToast(getString(R.string.shared_import_unreadable));
            return false;
        }
    }

    private void queueSharedImportText(String rawText, String sourceName) {
        if (rawText == null) {
            showToast(getString(R.string.shared_import_not_text));
            return;
        }

        byte[] bytes = rawText.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_SHARED_IMPORT_BYTES) {
            showToast(getString(R.string.shared_import_too_large));
            return;
        }

        String normalizedText = rawText.trim();
        if (normalizedText.isEmpty()) {
            showToast(getString(R.string.shared_import_not_text));
            return;
        }

        pendingSharedImportText = normalizedText;
        pendingSharedImportSourceName = TextUtils.isEmpty(sourceName)
            ? getString(R.string.shared_import_default_source)
            : sourceName;
        showToast(getString(R.string.shared_import_received));
    }

    private String readTextFromUri(Uri uri) throws IOException {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) {
                throw new IOException("Conteúdo indisponível.");
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int totalBytes = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                totalBytes += read;
                if (totalBytes > MAX_SHARED_IMPORT_BYTES) {
                    throw new SharedImportTooLargeException();
                }
                output.write(buffer, 0, read);
            }

            if (output.size() == 0) {
                throw new IOException("Conteúdo vazio.");
            }

            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private String resolveSharedSourceName(Intent intent, Uri uri) {
        if (uri != null) {
            String uriName = readDisplayName(uri);
            if (!TextUtils.isEmpty(uriName)) {
                return uriName;
            }
            String pathSegment = uri.getLastPathSegment();
            if (!TextUtils.isEmpty(pathSegment)) {
                return pathSegment;
            }
        }

        CharSequence subject = intent != null ? intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT) : null;
        if (subject != null && !TextUtils.isEmpty(subject.toString().trim())) {
            return subject.toString().trim();
        }

        return getString(R.string.shared_import_default_source);
    }

    private String readDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int columnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (columnIndex >= 0) {
                    String value = cursor.getString(columnIndex);
                    if (!TextUtils.isEmpty(value)) {
                        return value;
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // Alguns providers não expõem metadados estáveis; o fallback usa lastPathSegment.
        }
        return "";
    }

    private void markSharedImportIntentConsumed(Intent intent) {
        if (intent == null) {
            return;
        }

        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_SUBJECT);
    }

    private void flushPendingSharedImportToWebView() {
        if (webView == null || TextUtils.isEmpty(pendingSharedImportText)) {
            return;
        }

        final String importText = pendingSharedImportText;
        final String sourceName = pendingSharedImportSourceName == null ? "" : pendingSharedImportSourceName;
        String script =
            "(function(){try{" +
            "if(window.AraLearnAndroidImport&&window.AraLearnAndroidImport.receiveSharedJson){" +
            "return !!window.AraLearnAndroidImport.receiveSharedJson(" +
            JSONObject.quote(importText) +
            "," +
            JSONObject.quote(sourceName) +
            ");" +
            "}" +
            "return false;" +
            "}catch(_error){return false;}})();";

        webView.evaluateJavascript(script, value -> {
            if ("true".equals(value)) {
                pendingSharedImportText = null;
                pendingSharedImportSourceName = null;
            }
        });
    }

    private boolean isDebuggableApp() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static final class SharedImportTooLargeException extends IOException {
        SharedImportTooLargeException() {
            super("Arquivo muito grande para importação.");
        }
    }

    private final class AraLearnWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams
        ) {
            clearFilePathCallback();
            MainActivity.this.filePathCallback = filePathCallback;

            Intent chooserIntent;
            try {
                chooserIntent = fileChooserParams.createIntent();
            } catch (ActivityNotFoundException error) {
                clearFilePathCallback();
                showToast(getString(R.string.file_picker_unavailable));
                return false;
            }

            try {
                startActivityForResult(
                    Intent.createChooser(chooserIntent, getString(R.string.file_picker_title)),
                    REQUEST_FILE_CHOOSER
                );
                return true;
            } catch (ActivityNotFoundException error) {
                clearFilePathCallback();
                showToast(getString(R.string.file_picker_unavailable));
                return false;
            }
        }
    }

    private final class AraLearnWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            flushPendingSharedImportToWebView();
        }
    }

    private final class AndroidHostBridge {
        @JavascriptInterface
        public boolean saveExportFile(String base64Data, String fileName, String mimeType) {
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (IllegalArgumentException error) {
                showToast(getString(R.string.export_invalid));
                return false;
            }

            final PendingDocumentWrite exportData = new PendingDocumentWrite(
                bytes,
                sanitizeFileName(fileName, DEFAULT_EXPORT_NAME),
                sanitizeMimeType(mimeType)
            );

            runOnUiThread(() -> openExportDocument(exportData));
            return true;
        }

        @JavascriptInterface
        public void finishApp() {
            runOnUiThread(MainActivity.this::finish);
        }
    }
}
