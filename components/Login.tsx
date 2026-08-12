
import React, { useState } from 'react';
import { User, AppConfig, Job, Branch } from '../types';
import { UserPlus, LogIn, ShieldAlert, Briefcase, Loader2, Link as LinkIcon, Smartphone, AlertCircle, WifiOff, MapPin, Eye, EyeOff, FileSpreadsheet } from 'lucide-react';
import { getDeviceFingerprint } from '../utils';
import { LogoMark } from './Logo';

interface LoginProps {
  onLogin: (user: User) => void;
  allUsers: User[];
  adminConfig: AppConfig;
  availableJobs: Job[];
  branches: Branch[];
  setAdminConfig: (cfg: Partial<AppConfig>) => void;
  logAction: (action: string, details?: string) => void;
  onSync?: (url?: string, force?: boolean) => Promise<any>;
  /** يفتح شاشة التقارير كصفحة مستقلة. الزر في القائمة الجانبية
      أسفل «الإدارة»، والعودة من زرٍّ في الترويسة. */
  onOpenReports?: () => void;
}

export default function Login({ 
  onLogin, 
  allUsers, 
  adminConfig, 
  availableJobs, 
  branches, 
  setAdminConfig,
  logAction,
  onSync,
  onOpenReports
}: LoginProps) {
  const [mode, setMode] = useState<'register' | 'login' | 'admin'>('login');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [selectedJob, setSelectedJob] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!navigator.onLine) {
      setError('عذراً، لا يمكن إتمام عملية التسجيل والجهاز غير متصل بالإنترنت.');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: الجهاز غير متصل بالإنترنت');
      return;
    }

    if (!fullName || !nationalId || !password || !selectedJob || !defaultBranch) {
      setError('يرجى إكمال جميع البيانات واختيار الوظيفة والفرع الأساسي');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: بيانات ناقصة');
      return;
    }
    
    if (nationalId.length !== 14) {
      setError('الرقم القومي يجب أن يكون 14 رقماً');
      logAction('فشل تسجيل مستخدم جديد', `السبب: طول الرقم القومي غير صحيح (${nationalId.length})`);
      return;
    }
    
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أرقام/حروف');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: كلمة المرور قصيرة جداً');
      return;
    }

    if (password.startsWith('0')) {
      setError('كلمة المرور لا يمكن أن تبدأ بالرقم صفر (0) أو تكون أصفاراً فقط .');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: كلمة المرور تبدأ بصفر');
      return;
    }
    
    const deviceId = getDeviceFingerprint();

    const existingById = allUsers.find(u => u.nationalId === nationalId);
    if (existingById) {
      setError('عذراً، هذا الرقم القومي مسجل مسبقاً في النظام.');
      logAction('فشل تسجيل مستخدم جديد', `السبب: الرقم القومي مسجل مسبقاً (${nationalId})`);
      return;
    }

    // Check if device is already registered to another user (strictly)
    // Note: With multi-device support, a device ideally shouldn't be shared, but strictness can be relaxed if needed.
    // Here we keep it strict: One device = One User identity.
    const deviceOwner = allUsers.find(u => 
      u.deviceId === deviceId || (u.deviceIds && u.deviceIds.includes(deviceId))
    );
    if (deviceOwner) {
      setError(`عذراً، هذا الهاتف مرتبط بالفعل بحساب موظف آخر (${deviceOwner.fullName}).`);
      logAction('فشل تسجيل مستخدم جديد', `السبب: الهاتف مرتبط بموظف آخر (${deviceOwner.fullName})`);
      return;
    }

    setIsLoading(true);

    const branchObj = branches.find(b => b.id === defaultBranch);
    const branchNameForSheet = branchObj ? branchObj.name : defaultBranch;

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      fullName,
      nationalId,
      password,
      role: 'employee',
      deviceId: deviceId, // Legacy
      deviceIds: [deviceId], // New
      allowedDeviceCount: 1, // Default
      jobTitle: selectedJob,
      defaultBranchId: branchNameForSheet,
      registrationDate: new Date().toISOString()
    };

    if (adminConfig.googleSheetLink) {
      try {
        await fetch(adminConfig.googleSheetLink, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'registerUser',
            ...newUser,
            timestamp: newUser.registrationDate
          })
        });
      } catch (err) {
        console.error("Cloud registration failed", err);
      }
    }

    setIsLoading(false);
    logAction('تسجيل مستخدم جديد', `الموظف: ${fullName}, الوظيفة: ${selectedJob}`);
    onLogin(newUser);
  };

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!navigator.onLine) {
      setError('عذراً، لا يمكن تسجيل الدخول والجهاز غير متصل بالإنترنت.');
      logAction('فشل تسجيل دخول موظف', 'السبب: الجهاز غير متصل بالإنترنت');
      return;
    }

    setIsLoading(true);
    setError('');

    let currentUsersList = allUsers;
    const syncTargetUrl = adminConfig.syncUrl || adminConfig.googleSheetLink;

    // 1. المزامنة المباشرة مع شيت جوجل قبل التحقق من بيانات الدخول بالرقم القومي وكلمة المرور
    if (onSync && syncTargetUrl) {
      try {
        const syncedData = await onSync(syncTargetUrl, true);
        if (syncedData && Array.isArray(syncedData.users)) {
          currentUsersList = syncedData.users;
        }
      } catch (err) {
        console.warn('Pre-login sync notice:', err);
      }
    }

    if (currentUsersList.length === 0 && syncTargetUrl) {
      setError('تعذر جلب بيانات الموظفين من شيت جوجل، يرجى التأكد من الاتصال بالإنترنت ومحاولة الدخول مجدداً.');
      logAction('فشل تسجيل دخول موظف', 'السبب: تعذر جلب بيانات الموظفين');
      setIsLoading(false);
      return;
    }

    const trimmedNId = nationalId.trim();
    const trimmedPass = password.trim();

    const user = currentUsersList.find(u => 
      String(u.nationalId).trim() === trimmedNId && 
      String(u.password).trim() === trimmedPass
    );
    
    if (user) {
      const currentDeviceId = getDeviceFingerprint();
      
      // Check if this device belongs to someone else
      const otherDeviceOwner = currentUsersList.find(u => 
        u.id !== user.id && 
        String(u.nationalId).trim() !== trimmedNId &&
        ((u.deviceId === currentDeviceId) || (u.deviceIds && u.deviceIds.includes(currentDeviceId)))
      );
      
      if (otherDeviceOwner) {
        setError(`عذراً، هذا الهاتف مسجل باسم موظف آخر (${otherDeviceOwner.fullName}).`);
        logAction('فشل تسجيل دخول موظف', `السبب: الهاتف مسجل باسم موظف آخر (${otherDeviceOwner.fullName})`);
        setIsLoading(false);
        return;
      }

      // Logic for Multi-Device Support
      const userDevices = Array.isArray(user.deviceIds) ? user.deviceIds : (user.deviceId ? [user.deviceId] : []);
      const maxDevices = user.allowedDeviceCount || 1;

      if (userDevices.includes(currentDeviceId)) {
        // Device is already linked -> Allow Login
        setIsLoading(false);
        logAction('تسجيل دخول موظف', `الموظف: ${user.fullName}, الرقم القومي: ${user.nationalId}`);
        onLogin(user);
      } else {
        // Device not linked, check if we can add it
        if (userDevices.length < maxDevices) {
          // Add new device
          const updatedDevices = [...userDevices, currentDeviceId];
          const updatedUser = { 
            ...user, 
            deviceIds: updatedDevices,
            deviceId: currentDeviceId
          };
          
          if (syncTargetUrl) {
            try {
              await fetch(syncTargetUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'updateUserDevice',
                  nationalId: updatedUser.nationalId,
                  userId: updatedUser.id,
                  deviceIds: updatedDevices
                })
              });
              
              // CRITICAL: Re-sync from Google Sheets to confirm device ID saved and update global state
              if (onSync) {
                const refreshedData = await onSync(syncTargetUrl, true);
                if (refreshedData && Array.isArray(refreshedData.users)) {
                  const refreshedUser = refreshedData.users.find((u: User) => 
                    String(u.nationalId).trim() === String(updatedUser.nationalId).trim()
                  );
                  if (refreshedUser) {
                    setIsLoading(false);
                    logAction('تسجيل دخول موظف (ربط جهاز جديد)', `الموظف: ${refreshedUser.fullName}, الجهاز: ${currentDeviceId}`);
                    onLogin(refreshedUser);
                    return;
                  }
                }
              }
            } catch (err) {
              console.error("Sync device update failed", err);
            }
          }
          setIsLoading(false);
          logAction('تسجيل دخول موظف (ربط جهاز جديد)', `الموظف: ${updatedUser.fullName}, الجهاز: ${currentDeviceId}`);
          onLogin(updatedUser);
        } else {
          // Limit reached
          setIsLoading(false);
          logAction('فشل تسجيل دخول (تجاوز عدد الأجهزة)', `الموظف: ${user.fullName}, الجهاز: ${currentDeviceId}`);
          setError(`عذراً، لقد تجاوزت الحد المسموح من الأجهزة (${userDevices.length}/${maxDevices}). يرجى التواصل مع المسؤول.`);
        }
      }
    } else {
      setIsLoading(false);
      logAction('فشل تسجيل دخول موظف', `الرقم القومي: ${nationalId}`);
      setError('بيانات الدخول غير صحيحة، تأكد من الرقم القومي وكلمة المرور المسجلة بالشيت.');
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const user = adminUsername.trim();
    const pass = adminPassword.trim();
    
    // 1. Local Check (Configured from single source of truth in App.tsx)
    const isLocalValid = user === adminConfig.adminUsername && pass === adminConfig.adminPassword;

    if (isLocalValid) {
      logAction('تسجيل دخول مسؤول (محلي)', `المسؤول: ${user}`);
      onLogin({ id: 'admin-id', fullName: 'المسؤول', nationalId: '000', role: 'admin' });
      setIsLoading(false);
      return;
    }

    // 2. Cloud Check (if syncUrl is available) - To match ReportsView behavior
    if (adminConfig.syncUrl) {
      try {
        const response = await fetch(`${adminConfig.syncUrl}?action=getReportData&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`);
        const data = await response.json();
        
        if (!data.error) {
          // If cloud accepts, allow access to management
          logAction('تسجيل دخول مسؤول (سحابي)', `المسؤول: ${user}`);
          onLogin({ id: 'admin-id', fullName: `المسؤول (${user})`, nationalId: '000', role: 'admin' });
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error("Cloud admin check failed", err);
      }
    }

    logAction('فشل تسجيل دخول مسؤول', `المحاولة باسم: ${user}`);
    setError('بيانات المسؤول غير صحيحة. تأكد من حالة الأحرف (B كبيرة) أو استخدم بيانات تقارير المسؤول');
    setIsLoading(false);
  };

  const inputClasses = "w-full px-4 py-3.5 rounded-2xl border border-slate-600 bg-slate-900 text-white placeholder:text-slate-500 font-bold outline-none focus:border-blue-500 transition-all shadow-inner";

  const TABS: { id: 'login' | 'register' | 'admin'; label: string; icon: any; desc: string }[] = [
    { id: 'login',    label: 'دخول الموظف', icon: LogIn,       desc: 'سجّل حضورك وانصرافك' },
    { id: 'register', label: 'حساب جديد',   icon: UserPlus,    desc: 'أنشئ حسابك لأول مرة' },
    { id: 'admin',    label: 'الإدارة',      icon: ShieldAlert, desc: 'لوحة تحكم المسؤول' }
  ];

  return (
    <div className="login-shell">

      {/* ===================== القائمة الجانبية ===================== */}
      <aside className="login-side">
        <div className="login-side__head">
          <div className="flex justify-center mb-3">
            <LogoMark size={132} variant="full" />
          </div>
          <div className="login-side__sub">نظام الحضور والانصراف</div>
        </div>

        {/* القائمة تظهر دائماً. كانت مشروطة بوصول إعدادات الخادم، فكان
            الموظف على هاتف جديد يرى نموذج الدخول وحده بلا «حساب جديد»
            ولا «الإدارة» ولا «التقارير» — وإن تعثّر جلب الإعدادات لم تظهر أبداً.
            رسالة «جارٍ الاتصال بالخادم…» داخل البطاقة تكفي للتوضيح. */}
        {(
          <nav className="login-side__nav">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setMode(t.id); setError(''); }}
                className={`login-tab${mode === t.id ? ' login-tab--active' : ''}`}
              >
                <t.icon size={17} className="login-tab__icon" />
                <span>{t.label}</span>
              </button>
            ))}

            {/* التقارير تفتح صفحة مستقلة، فلا تحمل حالة نشطة كبقية التبويبات */}
            {onOpenReports && (
              <button type="button" onClick={onOpenReports} className="login-tab">
                <FileSpreadsheet size={17} className="login-tab__icon" />
                <span>التقارير</span>
              </button>
            )}
          </nav>
        )}

      </aside>

      {/* ===================== البطاقة الرئيسية ===================== */}
      <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="ut-accent-bar" />

        <div className="p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-white text-lg font-black">
              {TABS.find(t => t.id === mode)?.label}
            </h2>
            <p className="text-slate-500 text-[11px] font-bold mt-1">
              {TABS.find(t => t.id === mode)?.desc}
            </p>
          </div>

          {!adminConfig.syncUrl && mode !== 'admin' && (
            <div className="mb-5 p-4 bg-blue-900/20 border-r-4 border-blue-500 rounded-xl">
              <p className="text-blue-400 text-xs font-bold">جارٍ الاتصال بالخادم…</p>
            </div>
          )}

          {!navigator.onLine && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-400 text-[11px] font-black">
              <WifiOff size={16} /> الهاتف غير متصل بالإنترنت
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-900/20 border-r-4 border-red-500 rounded-xl text-red-400 text-xs font-bold flex gap-2 items-start">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/50 rounded-2xl flex items-center justify-center gap-2 text-blue-400 text-xs font-bold">
              <Loader2 className="animate-spin" size={16} /> جارٍ المعالجة والتحقق…
            </div>
          )}

          {/* ===== حساب جديد ===== */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <input type="text" placeholder="الاسم الرباعي" value={fullName} onChange={e => setFullName(e.target.value)} className={inputClasses} />
              <input type="text" placeholder="الرقم القومي (14 رقم)" maxLength={14} inputMode="numeric" value={nationalId} onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))} className={inputClasses} />

              <div className="relative">
                <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} className={`${inputClasses} appearance-none cursor-pointer text-right`}>
                  <option value="">-- اختر الوظيفة --</option>
                  {availableJobs.map(job => <option key={job.id} value={job.title}>{job.title}</option>)}
                </select>
                <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} className={`${inputClasses} appearance-none cursor-pointer text-right`}>
                  <option value="">-- اختر فرع العمل الأساسي --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <input type={showRegPassword ? 'text' : 'password'} placeholder="تعيين كلمة مرور" minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                {isLoading ? 'جارٍ الحفظ…' : 'تسجيل وتأمين الجهاز'}
              </button>
            </form>
          )}

          {/* ===== دخول الموظف ===== */}
          {mode === 'login' && (
            <form onSubmit={handleEmployeeLogin} className="space-y-4">
              <input type="text" placeholder="الرقم القومي" maxLength={14} inputMode="numeric" value={nationalId} onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))} className={inputClasses} />
              <div className="relative">
                <input type={showLoginPassword ? 'text' : 'password'} placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-sm">
                <LogIn size={20} /> دخول
              </button>
            </form>
          )}

          {/* ===== دخول المسؤول ===== */}
          {mode === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <input type="text" placeholder="اسم مستخدم المسؤول" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} className={inputClasses} />
              <div className="relative">
                <input type={showAdminPassword ? 'text' : 'password'} placeholder="كلمة مرور المسؤول" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
                <ShieldAlert size={20} /> دخول لوحة التحكم
              </button>
              <button type="button" onClick={() => setMode('login')} className="w-full text-slate-500 text-[11px] font-black py-2 hover:text-slate-300 transition-colors">
                العودة لدخول الموظف
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
