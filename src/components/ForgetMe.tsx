/** 회원 탈퇴 · 내 데이터 지우기 (업적 화면 맨 아래 + 마이프로필 맨 아래) */
import { useState } from 'react';
import { ask } from './ConfirmHost';
import { useAccount } from '../net/account';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { PwInput } from './ui';

const online = !!supabase;

/** 내 데이터 모두 지우기 (개인정보 파기) */
export function ForgetMe() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const acc = useAccount();
  // 회원이면 이 버튼은 회원 탈퇴(아이디·랭킹 점수까지 삭제) — 이 기기 정리로 착각하지 않게 따로 안내하고 두 번 확인
  const member = acc.status === 'member' && !!acc.profile;
  const forget = async () => {
    if (member) {
      if (!(await ask(`회원 탈퇴: 아이디 '${acc.profile!.username}'와 닉네임·랭킹 점수·전적·업적을 모두 지울까요? 다른 기기에서도 다시 로그인할 수 없어요.`, { ok: '탈퇴하기', danger: true }))) return;
      // 두 번째 확인은 지금 비밀번호로
      if (!pwOpen) return setPwOpen(true);
      if (!pw) return setErr('지금 비밀번호를 입력해 주세요.');
    } else if (!(await ask('이 기기의 계정과 게임 기록(전적·업적·연습 저장·화면 설정)을 모두 지울까요? 되돌릴 수 없어요.', { ok: '모두 지우기', danger: true }))) return;
    setBusy(true);
    setErr('');
    try {
      if (online) await api('forgetMe', member ? { current: pw } : {});
      try {
        await supabase?.auth.signOut();
      } catch {
        /* 이미 지워진 계정 */
      }
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('stockduel') || k.startsWith('sb-')) localStorage.removeItem(k);
      } catch {
        /* 저장소 접근 불가 */
      }
      location.assign('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  // 계정 확인 전엔 숨김 — 회원인데 잠깐 '게스트 계정 지우기' 문구가 보였다 바뀌지 않게
  if (acc.status === 'loading') return null;
  return (
    <section className="panel pad forget">
      <div>
        <b>{member ? '회원 탈퇴 · 내 데이터 지우기' : '내 데이터 지우기'}</b>
        <small className="muted">
          {member ? '회원 계정(아이디·닉네임·랭킹 점수)과 전적·업적, 이 기기의 연습 저장·화면 설정을 모두 지워요.' : '이 기기의 게스트 계정, 전적·업적, 연습 저장, 화면 설정을 모두 지워요.'}
        </small>
      </div>
      {member && pwOpen && (
        <label className="forget-pw">
          <span className="muted small">탈퇴하려면 지금 비밀번호를 입력해 주세요. 되돌릴 수 없어요.</span>
          <PwInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" maxLength={72} aria-label="지금 비밀번호" />
        </label>
      )}
      <button className="btn sm danger" onClick={forget} disabled={busy}>
        {busy ? '지우는 중…' : member ? '탈퇴하기' : '모두 지우기'}
      </button>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
