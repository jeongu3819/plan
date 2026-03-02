// src/context/UserContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { client } from '../api/client'; // ✅ 너 client.ts에서 export { client } 해둔 것

export type UserMe = {
  loginid: string;
  username: string;
  deptname?: string;
  mail?: string;
  role?: string; // ✅ 추가
  is_active?: boolean;
  user_id?: number;
};

type UserContextValue = {
  user: UserMe | null;
  setUser: React.Dispatch<React.SetStateAction<UserMe | null>>;
  loading: boolean;
  logout: () => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
};

/** ✅ SSO 로그인 시작: 백엔드 로그인 엔드포인트로 이동 */
const startSSOLogin = () => {
  const base = client.defaults.baseURL || '';
  // baseURL이 "http://host:8000/api" 라면 -> "/auth/login" 호출하면 "/api/auth/login"으로 감
  // 근데 window.location.href는 절대경로가 안전해서 baseURL 활용
  window.location.href = `${base}/auth/login`;
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // ✅ StrictMode/리렌더 대비: 로그인 트리거 중복 방지
  const loginTriggeredRef = useRef(false);

  const logout = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('me');
    setUser(null);
    // 필요하면 즉시 로그인 다시 태우기
    // startSSOLogin();
  };

  useEffect(() => {
    // ✅ 콜백 페이지에서는 자동 로그인 트리거 금지
    if (location.pathname === '/sso-callback') {
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        const token = localStorage.getItem('session_token');

        // 토큰 없으면 로그인 페이지로
        if (!token) {
          localStorage.setItem('redirect_after_login', location.pathname + location.search);

          if (!loginTriggeredRef.current) {
            loginTriggeredRef.current = true;
            startSSOLogin();
          }
          return;
        }

        // ✅ 인터셉터가 Authorization 붙이지만,
        // 토큰이 localStorage에 이미 있으니 그냥 호출하면 됨
        const res = await client.get<UserMe>('/auth/user/me');
        setUser(res.data);
        localStorage.setItem('me', JSON.stringify(res.data));

        loginTriggeredRef.current = false; // ✅ 성공하면 리셋
      } catch (err) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('me');

        localStorage.setItem('redirect_after_login', location.pathname + location.search);

        if (!loginTriggeredRef.current) {
          loginTriggeredRef.current = true;
          startSSOLogin();
        }
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [location.pathname, location.search]);

  const value = useMemo(() => ({ user, setUser, loading, logout }), [user, loading]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
