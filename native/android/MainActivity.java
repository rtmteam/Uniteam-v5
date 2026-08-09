package com.uniteam.attendance;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * نقطة دخول التطبيق.
 *
 * الإضافة الوحيدة على النسخة الافتراضية من Capacitor هي تسجيل الجسر الأصلي
 * باسم "AndroidBridge" ليصبح متاحاً في JavaScript عبر window.AndroidBridge.
 *
 * التسجيل يتم مباشرة بعد super.onCreate لأن الـ WebView يكون قد أُنشئ عندها،
 * وقبل أن تبدأ صفحة الويب في تنفيذ الـ JavaScript الخاص بها.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            // بعد عودة super.onCreate يكون Capacitor قد أنشأ الـ Bridge والـ WebView،
            // ولم تبدأ الصفحة تنفيذ JavaScript بعد.
            if (this.getBridge() != null) {
                WebView webView = this.getBridge().getWebView();
                if (webView != null) {
                    AndroidBridge bridge = new AndroidBridge(this);

                    // رابط التطبيق الأصلي: الخادم البعيد إن حُدّد، وإلا الرابط المحلي.
                    // تحتاجه صفحة انقطاع الاتصال لتعيد التحميل على العنوان الصحيح
                    // بدل عنوانها المحلي الذي يفتح المتصفح ويفشل.
                    String appUrl = this.getBridge().getServerUrl();
                    if (appUrl == null || appUrl.trim().isEmpty()) {
                        appUrl = this.getBridge().getAppUrl();
                    }
                    bridge.attach(webView, appUrl);

                    webView.addJavascriptInterface(bridge, "AndroidBridge");
                    android.util.Log.i("Uniteam", "AndroidBridge registered, appUrl=" + appUrl);
                }
            }
        } catch (Exception e) {
            // في حال فشل التسجيل يستمر التطبيق بالعمل،
            // وتتحول واجهة الويب تلقائياً إلى البدائل المتاحة.
            android.util.Log.e("Uniteam", "AndroidBridge registration failed", e);
        }
    }
}
