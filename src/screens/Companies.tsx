/** 공부: 게임 전에 미리 익혀 두기 — 투자 기초(규칙·변수) · 기업 살펴보기(회사·ETF) */
import { CARD_RULES_TEXT, CardGuideBody } from "../components/CardGuide";
import { GRANT_EVERY, holdLimit, USE_LIMIT } from "../game/items";
import { CURRENT_RULES_VERSION } from "../engine/engine";
import { useMemo, useState } from "react";
import { companyInfo, type CompanyInfo } from "../game/companyInfo";
import { SECTOR_MAP, STOCK_SECTORS, STOCKS } from "../game/stocks";
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
            <dt>같이 움직이는 업종</dt>
            <dd className="co-chips">
              {info.together.length ? (
                info.together.map((t) => (
                  <span key={t} className="chip sm">
                    {t}
                  </span>
                ))
              ) : (
                <span className="muted">-</span>
              )}
            </dd>
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
            {(info.supply.length > 0 || info.affectedBy.length > 0) && (
              <>
                <dt>연결된 회사</dt>
                <dd className="co-chips">
                  {info.supply.map((x) => (
                    <button
                      key={x.symbol}
                      className="chip sm"
                      onClick={() => onJump(x.symbol)}
                      title="이 회사에 좋은 일이 생기면 같이 움직여요"
                    >
                      → {x.name}
                    </button>
                  ))}
                  {info.affectedBy.map((x) => (
                    <button
                      key={x.symbol}
                      className="chip sm"
                      onClick={() => onJump(x.symbol)}
                      title="이 회사의 소식에 영향을 받아요"
                    >
                      ← {x.name}
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

/** 찬스 카드 꿀팁 (규칙과 같은 말만: 보유 한도·무료 지급 주기·같은 카드 사용 횟수는 게임 값에서) */
const CARD_TIPS: { icon: "search" | "news" | "cards" | "lock" | "warn" | "sparkles"; title: string; body: string }[] = [
  { icon: "search", title: "감별기는 장 전에", body: "루머 감별기는 오늘 소식(아침 뉴스·장 전 찌라시) 중 고른 하나가 진짜인지 알려줘요. 가장 비싼 카드라 큰돈이 걸린 소식에, 장이 열리기 전에 쓰면 그 결과로 예약 주문까지 걸 수 있어요." },
  { icon: "news", title: "내일 신문은 오늘 준비", body: "내일 아침 뉴스를 오늘 미리 보는 카드예요. 좋은 뉴스가 나올 종목을 오늘 장이 끝나기 전에 사 두면 내일 시작부터 앞서요." },
  { icon: "cards", title: `카드는 ${holdLimit(CURRENT_RULES_VERSION)}장까지`, body: `가진 카드가 꽉 차면 ${GRANT_EVERY}일마다 주는 무료 카드를 못 받아요. 아끼지 말고 써서 자리를 비워 두세요. 같은 카드는 한 판에 ${USE_LIMIT}번까지 쓸 수 있어요.` },
  { icon: "warn", title: "방해는 1위에게", body: "방해 카드는 한 사람에게 하루 한 번만 통해요. 이미 맞은 사람에게 쓰면 거절되고 카드는 그대로 남아요. 가장 앞선 사람을 노리세요." },
  { icon: "lock", title: "방어는 갖고만 있으면", body: "방패·반사 거울은 쓰지 않아도 갖고 있으면 방해를 자동으로 막거나 되돌려요. 앞서 나가고 있을 때 하나쯤 들고 있으면 든든해요." },
  { icon: "sparkles", title: "용돈 봉투는 운", body: "열면 확률에 따라 돈을 받거나 잃어요. 현금이 10만원 이상 있을 때만 쓸 수 있어요. 큰 판이 아닌 날 가볍게 열어 보세요." },
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
      <header className="page-head">
        <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2>공부</h2>
        <div className="ph-right" />
      </header>
      <div className="seg study-tabs" role="tablist" aria-label="공부">
        {(
          [
            ["basics", "투자 기초"],
            ["companies", "기업 살펴보기"],
            ["cards", "찬스 카드"],
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
          <p className="muted small">{CARD_RULES_TEXT}</p>
          <div className="study-basics card-tips">
            {CARD_TIPS.map((t) => (
              <section key={t.title} className="panel pad study-card">
                <div className="sc-head">
                  <Icon name={t.icon} size={18} />
                  <h3>{t.title}</h3>
                </div>
                <p>{t.body}</p>
              </section>
            ))}
          </div>
          <h3 className="study-sub">카드 도감</h3>
          <CardGuideBody />
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
