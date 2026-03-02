// src/pages/SsoCallback.tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../api/client";
import { useUser } from "../context/UserContext";

type MeResponse = {
  loginid: string;
  username: string;
  deptname?: string;
  mail?: string;
  is_admin?: boolean;
  is_superadmin?: boolean;
};

export default function SsoCallback() {
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const { setUser } = useUser();

  useEffect(() => {
    if (ranRef.current) return; // ✅ StrictMode 2번 실행 방지
    ranRef.current = true;

    (async () => {
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const searchParams = new URLSearchParams(window.location.search);

      const token =
        hashParams.get("token") ||
        searchParams.get("token") ||
        hashParams.get("access_token") ||
        searchParams.get("access_token");

      if (!token) {
        navigate("/", { replace: true });
        return;
      }

      // ✅ 토큰 저장
      localStorage.setItem("session_token", token);

      // ✅ 주소에서 토큰 제거
      window.history.replaceState({}, document.title, window.location.pathname);

      try {
        // ✅ 인터셉터가 Authorization 자동 부착
        const res = await client.get<MeResponse>("/auth/user/me");
        setUser(res.data); // ✅ 즉시 앱 전체에 반영
        localStorage.setItem("me", JSON.stringify(res.data));

        const redirectTo = localStorage.getItem("redirect_after_login") || "/";
        localStorage.removeItem("redirect_after_login");
        navigate(redirectTo, { replace: true });
      } catch (e) {
        localStorage.removeItem("session_token");
        localStorage.removeItem("me");
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return <div>로그인 처리 중...</div>;
}
