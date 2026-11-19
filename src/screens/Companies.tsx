/** 공부: 게임 전에 미리 익혀 두기 — 투자 기초(규칙·변수) · 기업 살펴보기(회사·ETF) */
import { AUG_RULES_TEXT, AugGuideBody } from "../components/Augments";
import { useMemo, useState } from "react";
import { companyInfo, type CompanyInfo } from "../game/companyInfo";
import { SECTOR_MAP, STOCK_MAP, STOCK_SECTORS, STOCKS } from "../game/stocks";
import { RIVALS } from "../game/market";
import { Icon, SectorIcon } from "../components/Icon";
import { SlideChips } from "../components/SlideChips";
import { FitText } from "../components/FitText";
import { StudyBasics } from "./Study";
import { EmptyState } from "../components/ui";

type Region = "all" | "국내" | "미국" | "ETF";

function Detail({
  info,
  onJump,
}: {
  info: CompanyInfo;
  onJump: (sym: string) => void;
}) {
  const d = info.def;
  const rivals = (RIVALS[d.symbol] ?? []).map((sym) => ({ symbol: sym, name: STOCK_MAP[sym]?.name ?? sym }));
  return (
    <div className="co-detail">
      <p className="co-desc">{d.desc}</p>
      <dl className="co-facts">
        {info.etf ? (
          <>
            <dt>따라가는 것</dt>
            <dd>
              {info.etf.what}
              {info.etf.lev !== 1 && (
                <b className={info.etf.lev > 0 ? "up" : "down"}>
                  {" "}
                  · {info.etf.lev > 0 ? `${info.etf.lev}배로` : "반대로"}{" "}
                  움직여요
                </b>
              )}
            </dd>
            {info.etf.members.length > 0 && info.etf.members.length <= 12 && (
              <>
                <dt>담고 있는 종목</dt>
                <dd className="co-chips">
                  {info.etf.members.map((m) => (
                    <span key={m} className="chip sm">
                      {m}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>거시 변수</dt>
            <dd>
              {info.macro.length ? (
                info.macro.map((m) => (
                  <span key={m.label} className={"co-macro " + m.dir}>
                    {m.label} <b>{m.dir === "up" ? "▲ 유리" : "▼ 불리"}</b>
                  </span>
                ))
              ) : (
                <span className="muted">금리·환율·유가 영향이 작아요</span>
              )}
            </dd>
            {info.together.length > 0 && (
              <>
                <dt>같이 움직이는 업종</dt>
                <dd className="co-chips">
                  {info.together.map((t) => (
                    <span key={t} className="chip sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {info.opposite.length > 0 && (
              <>
                <dt>반대로 움직이는 업종</dt>
                <dd className="co-chips">
                  {info.opposite.map((t) => (
                    <span key={t} className="chip sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {/* 화살표(→ ←)만으론 뜻을 몰라서 관계마다 이름을 붙임 (경쟁사는 뉴스 관련 종목 칩과 같은 말) */}
            {info.supply.length > 0 && (
              <>
                <dt>연결된 회사 · 이 회사 소식에 같이 움직여요</dt>
                <dd className="co-chips">
                  {info.supply.map((x) => (
                    <button key={x.symbol} className="chip sm" onClick={() => onJump(x.symbol)}>
                      {x.name}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {info.affectedBy.length > 0 && (
              <>
                <dt>이 회사에 영향을 주는 회사</dt>
                <dd className="co-chips">
                  {info.affectedBy.map((x) => (
                    <button key={x.symbol} className="chip sm" onClick={() => onJump(x.symbol)}>
                      {x.name}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {rivals.length > 0 && (
              <>
                <dt>경쟁사 · 한쪽에 좋은 소식이면 다른 쪽은 반대로 갈 수 있어요</dt>
                <dd className="co-chips">
                  {rivals.map((x) => (
                    <button key={x.symbol} className="chip sm" onClick={() => onJump(x.symbol)}>
                      {x.name}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {info.inEtfs.length > 0 && (
              <>
                <dt>이 종목을 담은 ETF</dt>
                <dd className="co-chips">
                  {info.inEtfs.map((t) => (
                    <span key={t} className="chip sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </>
        )}
      </dl>
    </div>
  );
}

/** 증강 꿀팁 */
const AUG_TIPS: { icon: "search" | "news" | "cards" | "lock" | "warn" | "sparkles"; title: string; body: string }[] = [
  { icon: "sparkles", title: "초반엔 오래 가는 것", body: "첫 고르기에서 고른 증강이 가장 오래 켜져 있어요. 적금·이자처럼 시간이 지나야 효과가 나는 증강은 초반에만 떠요." },
  { icon: "search", title: "정보는 큰 판에", body: "소식 진위·내일 헤드라인 같은 정보 증강은 종류마다 하루 한 번 쓸 수 있어요. 큰돈이 걸린 소식이 있는 날에 쓰세요." },
  { icon: "cards", title: "다시 뽑기는 칸마다", body: "마음에 안 드는 칸만 한 번씩 다시 뽑을 수 있어요. 나머지 칸은 그대로예요." },
  { icon: "warn", title: "뒤처지면 따라잡기", body: "여럿이 하는 판의 중반부터는 꼴찌일 때 돈을 받는 증강이 떠요. 앞서고 있으면 다른 걸 고르세요." },
  { icon: "lock", title: "상대 증강은 비밀", body: "상대가 무엇을 골랐는지는 판이 끝나야 결과 화면에서 보여요." },
];

export function Companies({ onBack }: { onBack: () => void }) {
  const [region, setRegion] = useState<Region>("all");
  const [sector, setSector] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"companies" | "basics" | "cards">("basics");
  const infos = useMemo(() => STOCKS.map((s) => companyInfo(s.symbol)), []);
  const shown = infos.filter(
    (i) =>
      (region === "all" || i.region === region) &&
      (!sector || i.def.sector === sector) &&
      (!q.trim() ||
        i.def.name.includes(q.trim()) ||
        SECTOR_MAP[i.def.sector].name.includes(q.trim())),
  );
  const sectors = STOCK_SECTORS.filter(
    (s) =>
      region === "all" ||
      (region === "국내"
        ? s.region === "KR"
        : region === "미국"
          ? s.region === "US"
          : false),
  );
  const jump = (sym: string) => {
    setRegion("all");
    setSector(null);
    setQ("");
    setOpen(sym);
    setTimeout(
      () =>
        document
          .getElementById("co-" + sym)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  };

  return (
    <div className="lobby page companies">
      <header className="page-head top">
        <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2>공부</h2>
        <p className="ph-desc muted small">투자 기초·기업·증강</p>
        <div className="ph-right" />
      </header>
      <div className="seg study-tabs" role="tablist" aria-label="공부">
        {(
          [
            ["basics", "투자 기초"],
            ["companies", "기업 살펴보기"],
            ["cards", "증강"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={view === k}
            className={view === k ? "on" : ""}
            onClick={() => setView(k)}
          >
            <b>{l}</b>
          </button>
        ))}
      </div>
      {view === "cards" && (
        <>
          <p className="muted small">{AUG_RULES_TEXT}</p>
          <div className="study-basics card-tips">
            {AUG_TIPS.map((t) => (
              <section key={t.title} className="panel pad study-card">
                <div className="sc-head">
                  <Icon name={t.icon} size={18} />
                  <h3>{t.title}</h3>
                </div>
                <p>{t.body}</p>
              </section>
            ))}
          </div>
          <h3 className="study-sub">증강 도감</h3>
          <AugGuideBody />
        </>
      )}
      {view === "basics" && (
        <>
          <p className="muted small">
            매판 가격과 뉴스는 다 달라요. 그래도 주가가 움직이는 원리는 같아서, 미리 알아 두면 처음 보는 상황에서도 빨리 판단할 수 있어요.
          </p>
          <StudyBasics />
        </>
      )}
      {view === "companies" && (
        <>
          <p className="muted small">
            게임에 나오는 회사와 ETF 예요. 어떤 일을 하는지, 금리·환율·유가에
            어떻게 반응하는지, 누구와 같이 움직이는지 미리 알아 두면 뉴스를 읽기
            쉬워져요.
          </p>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="회사·업종 이름으로 찾기"
              maxLength={20}
            />
          </div>
          <SlideChips
            label="지역"
            items={(["all", "국내", "미국", "ETF"] as Region[]).map((r) => ({
              id: r,
              fixed: r === "all",
              active: region === r,
              node: (
                <button
                  className={"chip" + (region === r ? " on" : "")}
                  onClick={() => (setRegion(r), setSector(null))}
                >
                  {r === "all" ? "전체" : r}
                </button>
              ),
            }))}
          />
          {region !== "ETF" && (
            <SlideChips
              label="업종"
              items={[
                {
                  id: "__all",
                  fixed: true,
                  active: !sector,
                  node: (
                    <button
                      className={"chip sm" + (!sector ? " on-soft" : "")}
                      onClick={() => setSector(null)}
                    >
                      모두
                    </button>
                  ),
                },
                ...sectors.map((s) => ({
                  id: s.id,
                  active: sector === s.id,
                  node: (
                    <button
                      className={
                        "chip sm" + (sector === s.id ? " on-soft" : "")
                      }
                      onClick={() => setSector(s.id)}
                    >
                      <SectorIcon id={s.id} /> {s.name}
                    </button>
                  ),
                })),
              ]}
            />
          )}
          <p className="muted small">{shown.length}개</p>
          {shown.length === 0 && (
            <EmptyState
              compact
              icon="search"
              title="찾는 회사가 없어요"
              desc="이름이나 업종을 다르게 써 보세요."
              action={<button className="btn sm" onClick={() => (setQ(""), setRegion("all"), setSector(null))}>검색 지우기</button>}
            />
          )}
          <div className="co-list">
            {shown.map((i) => {
              const isOpen = open === i.def.symbol;
              return (
                <section
                  key={i.def.symbol}
                  id={"co-" + i.def.symbol}
                  className={"co-card" + (isOpen ? " open" : "")}
                >
                  <button
                    className="co-head"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i.def.symbol)}
                  >
                    <span className="co-icon">
                      {i.def.etf ? (
                        <Icon name="cards" size={18} />
                      ) : (
                        <SectorIcon id={i.def.sector} size={18} />
                      )}
                    </span>
                    <span className="co-name">
                      <b>
                        <FitText>{i.def.name}</FitText>
                      </b>
                      <small>
                        {i.region} ·{" "}
                        {i.def.etf
                          ? i.def.etf.group
                          : SECTOR_MAP[i.def.sector].name}
                        {i.size && ` · ${i.size}`}
                      </small>
                    </span>
                    <span className="co-tags">
                      <span
                        className={
                          "risk-tag r" +
                          (i.risk === "안정형" ? 1 : i.risk === "보통" ? 2 : 3)
                        }
                      >
                        {i.risk}
                      </span>
                      {i.dividend && <span className="div-tag">배당</span>}
                    </span>
                    <Icon
                      name={isOpen ? "up" : "down"}
                      size={16}
                      className="co-caret"
                    />
                  </button>
                  {isOpen && <Detail info={i} onJump={jump} />}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
