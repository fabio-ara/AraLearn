package com.aralearn.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

public class MainActivity extends ComponentActivity {
    private static final String APP_URL =
        "https://appassets.androidplatform.net/assets/www/public/index.html";
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String AUTH_SCHEME = "aralearn";
    private static final String AUTH_HOST = "auth";
    private static final String AUTH_PATH = "/callback";
    private static final String JAVASCRIPT_MODULE_SUFFIX = ".mjs";
    private static final String JAVASCRIPT_MIME_TYPE = "text/javascript";
    private static final String JSON_MIME_TYPE = "application/json";
    private static final String CSV_MIME_TYPE = "text/csv";
    private static final int MAX_TEXT_EXPORT_BYTES = 8 * 1024 * 1024;
    private static final int MAX_TEXT_EXPORT_FILE_NAME_LENGTH = 160;
    private static final String TEXT_EXPORT_CACHE_PREFIX = "aralearn-text-export-";
    private static final String STATE_TEXT_EXPORT_PATH = "aralearn.textExport.path";
    private static final String STATE_TEXT_EXPORT_FILE_NAME = "aralearn.textExport.fileName";
    private static final String STATE_TEXT_EXPORT_MIME_TYPE = "aralearn.textExport.mimeType";
    private static final Pattern SAFE_TEXT_EXPORT_FILE_NAME =
        Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");
    private static final String BACK_PRESS_SCRIPT =
        "(function(){try{return !!(window.AraLearnAndroid && " +
        "window.AraLearnAndroid.handleBackPress && " +
        "window.AraLearnAndroid.handleBackPress());}catch(_error){return false;}})();";
    private static final String RUNTIME_FLUSH_SCRIPT =
        "(function(){try{if(window.AraLearnAndroid&&window.AraLearnAndroid.flush){" +
        "Promise.resolve(window.AraLearnAndroid.flush()).catch(function(){});" +
        "return true;}}catch(_error){}return false;})();";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PendingTextExport pendingTextExport;
    private WebViewAssetLoader assetLoader;
    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> completeFileChooser(result.getResultCode(), result.getData())
    );
    private final ActivityResultLauncher<Intent> textExportLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> completeTextExport(result.getResultCode(), result.getData())
    );

    private static final class PendingTextExport {
        final File source;
        final String fileName;
        final String mimeType;

        PendingTextExport(File source, String fileName, String mimeType) {
            this.source = source;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }

    private static final class RuntimeAssetPathHandler implements WebViewAssetLoader.PathHandler {
        private final WebViewAssetLoader.AssetsPathHandler assetsPathHandler;

        RuntimeAssetPathHandler(Context context) {
            assetsPathHandler = new WebViewAssetLoader.AssetsPathHandler(context);
        }

        @Override
        public WebResourceResponse handle(String path) {
            WebResourceResponse response = assetsPathHandler.handle(path);
            if (response != null && path.endsWith(JAVASCRIPT_MODULE_SUFFIX)) {
                response.setMimeType(JAVASCRIPT_MIME_TYPE);
            }
            return response;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.main_webview);
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new RuntimeAssetPathHandler(this))
            .build();

        configureWebView();
        configureBackNavigation();
        WebView.setWebContentsDebuggingEnabled(isDebuggableApp());
        restorePendingTextExport(savedInstanceState);

        String authUrl = resolveAuthCallbackUrl(getIntent());
        if (authUrl != null) {
            webView.loadUrl(authUrl);
        } else if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String authUrl = resolveAuthCallbackUrl(intent);
        if (authUrl != null && webView != null) {
            webView.loadUrl(authUrl);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        synchronized (this) {
            if (pendingTextExport != null) {
                outState.putString(STATE_TEXT_EXPORT_PATH, pendingTextExport.source.getAbsolutePath());
                outState.putString(STATE_TEXT_EXPORT_FILE_NAME, pendingTextExport.fileName);
                outState.putString(STATE_TEXT_EXPORT_MIME_TYPE, pendingTextExport.mimeType);
            }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        clearFilePathCallback();
        if (isChangingConfigurations()) {
            synchronized (this) {
                pendingTextExport = null;
            }
        } else {
            clearPendingTextExport();
        }

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

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @SuppressWarnings("deprecation")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(
            isDebuggableApp()
                ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                : WebSettings.MIXED_CONTENT_NEVER_ALLOW
        );

        webView.addJavascriptInterface(new AndroidHostBridge(), "AndroidHost");
        webView.setWebViewClient(new AraLearnWebViewClient());
        webView.setWebChromeClient(new AraLearnWebChromeClient());
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    finish();
                    return;
                }

                webView.evaluateJavascript(BACK_PRESS_SCRIPT, value -> {
                    if (!"true".equals(value)) {
                        finish();
                    }
                });
            }
        });
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript(RUNTIME_FLUSH_SCRIPT, null);
        }
        super.onPause();
    }

    private String resolveAuthCallbackUrl(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri = intent.getData();
        if (
            uri == null ||
            !AUTH_SCHEME.equalsIgnoreCase(uri.getScheme()) ||
            !AUTH_HOST.equalsIgnoreCase(uri.getHost()) ||
            !AUTH_PATH.equals(uri.getPath())
        ) {
            return null;
        }

        StringBuilder destination = new StringBuilder(APP_URL);
        String query = uri.getEncodedQuery();
        if (!TextUtils.isEmpty(query)) destination.append('?').append(query);
        String fragment = uri.getEncodedFragment();
        if (!TextUtils.isEmpty(fragment)) destination.append('#').append(fragment);
        return destination.toString();
    }

    private void openExternalUrl(Uri uri) {
        String scheme = uri == null ? null : uri.getScheme();
        if (
            !"https".equalsIgnoreCase(scheme) &&
            !"http".equalsIgnoreCase(scheme) &&
            !"mailto".equalsIgnoreCase(scheme) &&
            !"tel".equalsIgnoreCase(scheme)
        ) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            showToast(getString(R.string.file_picker_unavailable));
        }
    }

    private void clearFilePathCallback() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
    }

    private void completeFileChooser(int resultCode, Intent data) {
        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        if (callback != null) {
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        }
    }

    private void deletePendingTextExport(PendingTextExport pending) {
        if (pending != null && pending.source.exists()) pending.source.delete();
    }

    private void clearPendingTextExport() {
        deletePendingTextExport(takePendingTextExport());
    }

    private synchronized PendingTextExport takePendingTextExport() {
        PendingTextExport pending = pendingTextExport;
        pendingTextExport = null;
        return pending;
    }

    private synchronized boolean reserveTextExport(byte[] bytes, String fileName, String mimeType) {
        if (pendingTextExport != null || isFinishing() || isDestroyed()) return false;
        File source = null;
        try {
            source = File.createTempFile(TEXT_EXPORT_CACHE_PREFIX, ".tmp", getCacheDir());
            try (FileOutputStream output = new FileOutputStream(source, false)) {
                output.write(bytes);
                output.flush();
            }
            pendingTextExport = new PendingTextExport(source, fileName, mimeType);
            return true;
        } catch (IOException | RuntimeException error) {
            if (source != null && source.exists()) source.delete();
            return false;
        }
    }

    private void restorePendingTextExport(Bundle state) {
        if (state == null) return;
        String path = state.getString(STATE_TEXT_EXPORT_PATH);
        String fileName = state.getString(STATE_TEXT_EXPORT_FILE_NAME);
        String mimeType = normalizeTextExportMimeType(state.getString(STATE_TEXT_EXPORT_MIME_TYPE));
        if (path == null || mimeType == null || !validTextExportFileName(fileName, mimeType)) return;
        File source = new File(path);
        try {
            String cachePrefix = getCacheDir().getCanonicalPath() + File.separator;
            String sourcePath = source.getCanonicalPath();
            if (!sourcePath.startsWith(cachePrefix) ||
                !source.getName().startsWith(TEXT_EXPORT_CACHE_PREFIX) ||
                !source.isFile() || source.length() > MAX_TEXT_EXPORT_BYTES) {
                return;
            }
            synchronized (this) {
                pendingTextExport = new PendingTextExport(source, fileName, mimeType);
            }
        } catch (IOException | SecurityException error) {
            clearPendingTextExport();
        }
    }

    private void openTextExport() {
        final PendingTextExport pending;
        synchronized (this) {
            pending = pendingTextExport;
        }
        if (pending == null) return;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(pending.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, pending.fileName);
        try {
            textExportLauncher.launch(intent);
        } catch (ActivityNotFoundException | IllegalStateException | SecurityException error) {
            clearPendingTextExport();
            showToast(getString(R.string.text_export_unavailable));
        }
    }

    private void completeTextExport(int resultCode, Intent data) {
        PendingTextExport pending = takePendingTextExport();
        if (pending == null || resultCode != RESULT_OK || data == null || data.getData() == null) {
            deletePendingTextExport(pending);
            return;
        }
        Uri destination = data.getData();
        new Thread(() -> saveTextExport(destination, pending), "aralearn-text-export").start();
    }

    private void saveTextExport(Uri destination, PendingTextExport pending) {
        try (InputStream input = new FileInputStream(pending.source);
             OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) throw new IOException("Destino indisponível.");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
            showToast(getString(R.string.text_export_success, pending.fileName));
        } catch (IOException | RuntimeException error) {
            showToast(getString(R.string.text_export_error));
        } finally {
            deletePendingTextExport(pending);
        }
    }

    private String normalizeTextExportMimeType(String value) {
        String mimeType = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return JSON_MIME_TYPE.equals(mimeType) || CSV_MIME_TYPE.equals(mimeType)
            ? mimeType
            : null;
    }

    private boolean validTextExportFileName(String value, String mimeType) {
        if (
            value == null || value.isEmpty() || value.length() > MAX_TEXT_EXPORT_FILE_NAME_LENGTH ||
            !value.equals(value.trim()) || value.contains("..") ||
            !SAFE_TEXT_EXPORT_FILE_NAME.matcher(value).matches()
        ) {
            return false;
        }
        String lowerName = value.toLowerCase(Locale.ROOT);
        return JSON_MIME_TYPE.equals(mimeType)
            ? lowerName.endsWith(".json")
            : lowerName.endsWith(".csv");
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
                fileChooserLauncher.launch(
                    Intent.createChooser(chooserIntent, getString(R.string.file_picker_title))
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
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (APP_ORIGIN.equalsIgnoreCase(uri.getScheme() + "://" + uri.getAuthority())) {
                return false;
            }
            if (
                AUTH_SCHEME.equalsIgnoreCase(uri.getScheme()) &&
                AUTH_HOST.equalsIgnoreCase(uri.getHost()) &&
                AUTH_PATH.equals(uri.getPath())
            ) {
                view.loadUrl(resolveAuthCallbackUrl(new Intent(Intent.ACTION_VIEW, uri)));
                return true;
            }
            if (!request.isForMainFrame()) {
                return true;
            }
            openExternalUrl(uri);
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

    }

    private final class AndroidHostBridge {
        @JavascriptInterface
        public boolean saveTextFile(String content, String fileName, String mimeTypeValue) {
            String mimeType = normalizeTextExportMimeType(mimeTypeValue);
            if (content == null || mimeType == null || !validTextExportFileName(fileName, mimeType)) {
                showToast(getString(R.string.text_export_invalid));
                return false;
            }
            if (content.length() > MAX_TEXT_EXPORT_BYTES) {
                showToast(getString(R.string.text_export_too_large));
                return false;
            }
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_TEXT_EXPORT_BYTES) {
                showToast(getString(R.string.text_export_too_large));
                return false;
            }
            if (!reserveTextExport(bytes, fileName, mimeType)) {
                showToast(getString(R.string.text_export_unavailable));
                return false;
            }
            runOnUiThread(MainActivity.this::openTextExport);
            return true;
        }

        @JavascriptInterface
        public void finishApp() {
            runOnUiThread(MainActivity.this::finish);
        }
    }
}
