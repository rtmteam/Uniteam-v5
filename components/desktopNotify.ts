import { postRequestAction } from './requestsApi';
import { getSavedLogin, isDesktopApp, desktopInvoke, SavedLogin } from '../utils';
import type { StaffRequest, LeaveDetails } from '../types';

/**
 * إشعارات طلبات الموظفين — تطبيق ويندوز فقط.
 *
 * يفحص الطلبات كل دقيقتين بحسابات المدير/المشرف المتاحة على الجهاز:
 * الجلسة المفتوحة الآن، وبيانات «تذكرني» المحفوظة. كل حساب يرى موظفيه فقط
 * (نفس صلاحيات getApproverRequests في الخادم)، فلا يصل المشرف إلا ما يخصّه.
 *
 * يعمل ما دام التطبيق يعمل — مفتوحاً أو مصغّراً أو بجانب الساعة.
 * الإشعار نفسه يُعرض من غلاف ويندوز (أمر notify في native/windows/src/main.rs).
 */

const POLL_MS = 2 * 60 * 1000;
const FIRST_DELAY_MS = 15 * 1000;
const SEEN_KEY = 'uniteam_notified_requests';

let sessionApprover: SavedLogin | null = null;

/** يُستدعى عند دخول حساب تقارير/مسؤول وعند خروجه */
export const setSessionApprover = (c: SavedLogin | null): void => {
  sessionApprover = c && c.user && c.pass ? { user: c.user, pass: c.pass } : null;
};

const credentials = (): SavedLogin[] => {
  const all = [sessionApprover, getSavedLogin('reports'), getSavedLogin('admin')];
  const out: SavedLogin[] = [];
  all.forEach(c => { if (c && !out.some(x => x.user === c.user && x.pass === c.pass)) out.push(c); });
  return out;
};

const readSeen = (): Record<string, string> | null => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
};

const writeSeen = (v: Record<string, string>) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) { /* التخزين محجوب */ }
};

const describe = (r: StaffRequest): string => {
  if (r.type === 'leave') {
    const l = (r.items || {}) as LeaveDetails;
    return `إجازة${l.leaveType ? ' ' + l.leaveType : ''} من ${l.from || '—'} إلى ${l.to || '—'}`;
  }
  return `خطة شهر ${r.month}`;
};

const notify = (title: string, body: string) => desktopInvoke('notify', { title, body });

/** يبدأ الفحص الدوري ويعيد دالة الإيقاف. لا يفعل شيئاً خارج تطبيق ويندوز */
export function startDesktopNotifier(getSyncUrl: () => string): () => void {
  if (!isDesktopApp()) return () => {};

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const url = getSyncUrl();
      const creds = credentials();
      if (!url || creds.length === 0 || !navigator.onLine) return;

      const all = new Map<string, StaffRequest>();
      let anyOk = false;
      for (const c of creds) {
        const res = await postRequestAction(url, { action: 'getApproverRequests', approverUser: c.user, approverPass: c.pass });
        if (res.ok) {
          anyOk = true;
          (res.requests || []).forEach(r => all.set(r.id, r));
        }
      }
      if (!anyOk || stopped) return;

      const seen = readSeen();
      const next: Record<string, string> = {};
      all.forEach(r => { next[r.id] = r.submittedAt; });
      writeSeen(next);

      const pending = Array.from(all.values()).filter(r => r.status === 'pending');

      // أول تشغيل على هذا الجهاز: ملخّص واحد بدل سيل إشعارات قديمة
      if (!seen) {
        if (pending.length > 0) {
          await notify('Uniteam — طلبات بانتظار المراجعة', `لديك ${pending.length} طلب معلّق من الموظفين.`);
        }
        return;
      }

      const fresh = pending.filter(r => seen[r.id] !== r.submittedAt);
      if (fresh.length === 0) return;

      if (fresh.length > 3) {
        await notify('Uniteam — طلبات جديدة', `وصل ${fresh.length} طلبات جديدة أو معدّلة من الموظفين.`);
        return;
      }
      for (const r of fresh) {
        const edited = seen[r.id] !== undefined;
        const title = edited ? `✏️ تعديل طلب — ${r.userName}` : `🆕 طلب جديد — ${r.userName}`;
        const who = [r.serialNumber, r.jobTitle].filter(Boolean).join(' · ');
        await notify(title, `${describe(r)}${who ? '\n' + who : ''}`);
      }
    } catch (e) {
      console.warn('desktop notifier tick failed', e);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, FIRST_DELAY_MS);
  const timer = setInterval(tick, POLL_MS);
  return () => { stopped = true; clearTimeout(first); clearInterval(timer); };
}
