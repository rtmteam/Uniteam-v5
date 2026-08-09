#!/usr/bin/env python3
"""
يضيف الصلاحيات المطلوبة إلى AndroidManifest.xml الذي يولّده Capacitor.

القالب الافتراضي يحتوي على INTERNET فقط، وبدون الصلاحيات أدناه يرفض أندرويد
أي طلب صلاحية موقع في وقت التشغيل رفضاً صامتاً، فيفشل تحديد الموقع كلياً.

السكربت آمن للتشغيل أكثر من مرة: يتخطى أي صلاحية موجودة مسبقاً.
"""

import re
import sys
from pathlib import Path

MANIFEST = Path(sys.argv[1] if len(sys.argv) > 1
                else "android/app/src/main/AndroidManifest.xml")

PERMISSIONS = [
    # تحديد الموقع - أساس تسجيل الحضور والانصراف
    ("android.permission.ACCESS_FINE_LOCATION", "موقع دقيق عبر GPS"),
    ("android.permission.ACCESS_COARSE_LOCATION", "موقع تقريبي عبر الشبكة"),
    # حالة الشبكة - للتحقق من الاتصال قبل الإرسال
    ("android.permission.ACCESS_NETWORK_STATE", "فحص حالة الاتصال"),
    # رؤية التطبيقات المثبتة - لكشف برامج الموقع الوهمي على أندرويد 11+
    ("android.permission.QUERY_ALL_PACKAGES", "كشف تطبيقات الموقع الوهمي"),
]


def main() -> int:
    if not MANIFEST.exists():
        print(f"[خطأ] الملف غير موجود: {MANIFEST}")
        return 1

    content = MANIFEST.read_text(encoding="utf-8")
    original = content

    added, skipped = [], []
    lines = []

    for perm, note in PERMISSIONS:
        if perm in content:
            skipped.append(perm)
        else:
            lines.append(f'    <!-- {note} -->')
            lines.append(f'    <uses-permission android:name="{perm}" />')
            added.append(perm)

    if lines:
        block = "\n" + "\n".join(lines) + "\n"
        # الإدراج قبل إغلاق وسم manifest مباشرة
        if "</manifest>" not in content:
            print("[خطأ] وسم </manifest> غير موجود - الملف غير سليم")
            return 1
        content = content.replace("</manifest>", block + "</manifest>", 1)

    # ميزة اختيارية على أندرويد 12+: تنبيه إن اختار المستخدم الموقع التقريبي فقط
    if 'android:foregroundServiceType' not in content:
        pass  # لا نحتاج خدمة أمامية - المراقبة تتم والتطبيق مفتوح فقط

    if content != original:
        MANIFEST.write_text(content, encoding="utf-8")

    print("=" * 55)
    print("تعديل AndroidManifest.xml")
    print("=" * 55)
    for p in added:
        print(f"  [أضيفت]  {p}")
    for p in skipped:
        print(f"  [موجودة] {p}")

    # تحقق نهائي
    final = MANIFEST.read_text(encoding="utf-8")
    missing = [p for p, _ in PERMISSIONS if p not in final]
    if missing:
        print("\n[فشل] صلاحيات ناقصة بعد التعديل:")
        for p in missing:
            print(f"  - {p}")
        return 1

    count = len(re.findall(r"<uses-permission", final))
    print(f"\n[نجاح] إجمالي الصلاحيات في الملف: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
