'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signIn(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">🏠 Golden Note</h1>
        <p className="text-gray-500 text-center mb-8">英語学習メソッド</p>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full p-3 border border-gray-300 rounded-lg text-base" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワード" className="w-full p-3 border border-gray-300 rounded-lg text-base" required />
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold text-base hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        <p className="text-center mt-6 text-sm text-gray-500">
          アカウントがない場合 → <a href="/signup" className="text-blue-600 font-bold">新規登録</a>
        </p>
      </div>
    </div>
  );
}
