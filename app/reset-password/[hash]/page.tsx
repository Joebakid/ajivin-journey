export default function ResetPasswordPage({ params }: { params: { hash: string } }) {

  async function updatePassword(formData: FormData) {
    'use server';
    const password = formData.get('password');
    const confirm = formData.get('confirmPassword');

    if (password !== confirm) {
      console.log('Passwords do not match');
      return;
    }

    // TODO: Verify params.hash against Neon DB
    // TODO: Hash the new password and update the user record
    console.log('Updating password for hash:', params.hash);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 md:p-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Create New Password</h1>
          <p className="text-sm text-slate-500">Hash ID: <span className="font-mono text-xs">{params.hash.substring(0,8)}...</span></p>
        </div>

        <form action={updatePassword} className="space-y-5">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">New Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-md"
          >
            Update Password
          </button>
        </form>
      </div>
    </main>
  );
}
