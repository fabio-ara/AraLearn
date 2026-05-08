package com.aralearn.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
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

import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String APP_URL =
        "https://appassets.androidplatform.net/assets/www/public/index.html";
    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final int REQUEST_EXPORT_DOCUMENT = 1002;
    private static final String DEFAULT_EXPORT_NAME = "aralearn-export.json";
    private static final String DEFAULT_EXPORT_MIME = "application/json";
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

    private boolean isDebuggableApp() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
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
