/**
 * PC 차트 칸 아래에 늘 붙어 있는 '사기 / 팔기' 바. 누르면 주문 창이 가운데에 뜸 (모바일의 아래 시트와 같은 흐름)
 * → 차트 칸 안에 주문 칸을 길게 넣지 않아 스크롤이 거의 생기지 않음
 */
import { Icon } from './Icon';

export function TradeJump({ easy, canSell, price, openOrders = 0, onBuy, onSell, onCantSell }: { easy: boolean; canSell: boolean; price: string; openOrders?: number; onBuy: () => void; onSell: () => void; onCantSell?: () => void }) {
  return (
    <div className="trade-jump show">
      <span className="tj-price">
        {price}
        {openOrders > 0 && <small className="tj-orders">예약 {openOrders}건</small>}
      </span>
      {/* 휴대폰과 같은 순서: 왼쪽 팔기 · 오른쪽 사기 (자리가 바뀌어 잘못 누르지 않게) */}
      {/* 가진 주식이 없으면 흐리게 두고 누르면 까닭을 알림 (꺼 두기만 하면 눌러도 반응이 없었음) */}
      <button className={'btn sell' + (canSell ? '' : ' is-off')} onClick={canSell ? onSell : onCantSell} aria-disabled={!canSell || undefined} disabled={!canSell && !onCantSell} title={canSell ? '팔기' : '가진 주식이 없어요'}>
        {easy ? '팔기' : '매도'}
      </button>
      <button className="btn buy" onClick={onBuy} title="사기 (Enter)">
        <Icon name="cart" size={15} /> {easy ? '사기' : '매수'}
      </button>
    </div>
  );
}
