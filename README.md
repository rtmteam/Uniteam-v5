# Uniteam — نظام الحضور والانصراف

تطبيق تسجيل حضور وانصراف للموظفين مع تحقق من الموقع الجغرافي (GPS)، ولوحة تحكم
للمسؤولين، وتقارير، وقاعدة بيانات على Google Sheets.

---

## طريقتا الاستخدام

**1. نسخة الويب (PWA)**
تعمل من المتصفح مباشرة عبر رابط GitHub Pages. يمكن تثبيتها على الشاشة الرئيسية.

**2. تطبيق APK**
يُوزَّع على الموظفين مباشرة (غير منشور على Google Play). نسخة الـ APK تضيف ثلاث
حمايات غير متاحة في المتصفح:

| الحماية | كيف تعمل |
|---|---|
| كشف الموقع الوهمي | قراءة العلم الرسمي `Location.isMock()` من نظام أندرويد — لا يستطيع أي تطبيق Fake GPS تزويره |
| كشف وضع المطورين | `Settings.Global.DEVELOPMENT_SETTINGS_ENABLED` + كشف المحاكيات |
| ربط الحساب بالجهاز | `ANDROID_ID` — يبقى ثابتاً بعد إعادة تثبيت التطبيق ومسح بياناته |

---

## المتطلبات

- Node.js 20 أو أحدث
- JDK 21 (لبناء الـ APK فقط)
- Android SDK بـ compileSdk 36

---

## التشغيل محلياً

```bash
npm install
npm run dev
```

## بناء نسخة الويب

```bash
npm run build      # يشغّل tsc ثم vite build، والناتج في مجلد dist/
```

النشر على GitHub Pages يتم تلقائياً عند كل push على فرع `main` عبر
`.github/workflows/deploy.yml`.

## بناء APK

```bash
npm install
npm run build
npx cap sync android      # يولّد الملفات الناقصة تلقائياً

cd android
./gradlew assembleRelease         # على ويندوز: .\gradlew.bat assembleRelease
```

الناتج: `android/app/build/outputs/apk/release/`

للاختبار السريع يمكن استخدام `assembleDebug` بدلاً منها.

### توقيع نسخة الإصدار (مهم)

`ANDROID_ID` المستخدم في ربط الأجهزة **مرتبط بمفتاح توقيع التطبيق**. إذا وقّعت
نسخة الإصدار بمفتاح مختلف عن النسخة المثبتة لدى الموظفين، ستتغير كل معرّفات
الأجهزة وسيُحجب الجميع. لذلك أنشئ مفتاحاً واحداً واستخدمه دائماً:

```bash
keytool -genkey -v -keystore uniteam-release.keystore \
  -alias uniteam -keyalg RSA -keysize 2048 -validity 10000
```

ثم أنشئ `android/keystore.properties` (**ولا ترفعه على GitHub**):

```properties
storeFile=../../uniteam-release.keystore
storePassword=كلمة_مرور_المخزن
keyAlias=uniteam
keyPassword=كلمة_مرور_المفتاح
```

إن لم يوجد هذا الملف، يستخدم البناء مفتاح debug تلقائياً حتى لا يفشل.

> عند إصدار نسخة جديدة، ارفع `versionCode` في `android/app/build.gradle` — وإلا
> سيرفض أندرويد تثبيت التحديث فوق النسخة الحالية.

---

## إعداد الخادم (Google Apps Script)

1. افتح شيت جوجل الخاص بالنظام ← Extensions ← Apps Script.
2. الصق محتوى `google-apps-script.js` بالكامل.
3. Deploy ← Manage deployments ← New version ← Deploy.
4. ضع رابط `/exec` الناتج في `public/server-config.json`.

### ضبط بيانات المسؤول

كلمة مرور المسؤول **ليست في الكود** (كانت كذلك سابقاً وهي ثغرة أُصلحت). أضفها في
ورقة `Config` داخل الشيت:

| Key | Value |
|---|---|
| `admin_user` | اسم المستخدم |
| `admin_pass` | كلمة المرور |

التحقق يتم داخل السيرفر فقط عبر `action: 'adminLogin'`.

---

## ملاحظات أمنية

- `doGet?action=getData` **لا يُرجع كلمات المرور**. تسجيل الدخول يمر عبر
  `doPost` بالإجراء `action: 'login'` والمقارنة تتم داخل السيرفر.
- كل طلبات `fetch` إلى Apps Script تستخدم `Content-Type: text/plain` — القيمة
  `application/json` ليست ضمن قائمة CORS المسموحة في وضع `no-cors` ويحذفها
  المتصفح.
- `android:allowBackup="false"` مقصود: يمنع نقل معرّف الجهاز إلى هاتف آخر عبر
  النسخ الاحتياطي.
- لا ترفع `*.keystore` ولا `keystore.properties` ولا `android/local.properties`.

---

## بنية المشروع

```
App.tsx                  الواجهة الرئيسية وإدارة الحالة والمزامنة
components/
  Login.tsx              تسجيل الدخول والتسجيل الجديد وربط الجهاز
  UserDashboard.tsx      شاشة الموظف وتسجيل الحضور/الانصراف
  AdminDashboard.tsx     لوحة تحكم المسؤول
  ReportsView.tsx        التقارير والتصدير إلى Excel
utils.ts                 المسافات، معرّف الجهاز، مزامنة الوقت، الفحوصات الأمنية
types.ts                 تعريفات الأنواع
google-apps-script.js    كود السيرفر (يُلصق في محرر Apps Script)
public/
  server-config.json     رابط الخدمة السحابية
  error.html             شاشة الخطأ عند تعذّر الاتصال في الـ APK
  sw.js                  Service Worker للعمل دون اتصال
android/                 مشروع Capacitor لأندرويد
  .../SecurityPlugin.java  كشف Fake GPS ووضع المطورين والمحاكيات + ANDROID_ID
```
