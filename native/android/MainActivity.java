package com.uniteam.attendance;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

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

                    applySystemBarInsets(webView);
                }
            }
        } catch (Exception e) {
            // في حال فشل التسجيل يستمر التطبيق بالعمل،
            // وتتحول واجهة الويب تلقائياً إلى البدائل المتاحة.
            android.util.Log.e("Uniteam", "AndroidBridge registration failed", e);
        }
    }

    /**
     * إبعاد الواجهة عن شريط الحالة أعلى الشاشة وشريط التنقّل أسفلها.
     *
     * أندرويد 15 يفرض العرض من حافة إلى حافة على كل تطبيق مبنيّ بـ SDK 35
     * فأعلى — والبناء هنا بـ SDK 36 — فيرسم النظام الشريطين فوق صفحة الويب
     * ويختفي تحتهما جزء من الترويسة وشريط التثبيت السفلي.
     *
     * الاعتماد على env(safe-area-inset-*) في CSS وحده غير كافٍ: بعض إصدارات
     * WebView لا تُبلّغ الصفحة بالقيم فتعود أصفاراً. أما قراءة الحواف من
     * النظام مباشرة وتحويلها إلى حشو على الـ WebView فتعمل على كل الإصدارات.
     *
     * ما خلف الشريطين يظهر بلون خلفية النافذة المضبوط في capacitor.config.json
     * (#0A1428) فيبدو امتداداً للترويسة الكحلية لا فراغاً أسود.
     */
    private void applySystemBarInsets(final View target) {
        ViewCompat.setOnApplyWindowInsetsListener(target, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            android.util.Log.i("Uniteam",
                "insets top=" + bars.top + " bottom=" + bars.bottom +
                " left=" + bars.left + " right=" + bars.right);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(target);
    }
}
