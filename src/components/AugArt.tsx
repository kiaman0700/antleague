/** 증강마다 고유 아이콘 (같은 종류끼리도 한눈에 구분되게). 등급은 테두리 모양·색으로 */
import {
  Anchor, ArrowUpRight, Banknote, BadgePercent, BatteryCharging, BedDouble, Bitcoin, BookOpenCheck, Briefcase, CalendarCheck, CalendarDays, CandlestickChart,
  Castle, Cherry, ChevronsUp, Cpu, Crosshair, Crown, Diamond, Dices, Droplets, Dumbbell, Ear, Earth, Eye, FileBarChart, Flame, FlaskConical, Footprints, Gem,
  Gift, Glasses, Globe, GraduationCap, Hammer, HandCoins, Layers, LineChart, ListChecks, MessagesSquare, Newspaper, NotebookPen, Percent, PieChart, PiggyBank,
  Rocket, ScanSearch, SearchCheck, Shield, ShieldCheck, ShieldPlus, Sprout, Swords, Target, Telescope, Ticket, Timer, TrendingUp, Trophy, Undo2, Users, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';

const ART: Record<string, LucideIcon> = {
  cash1: Banknote, cash2: Wallet, cash3: Gem,
  save1: PiggyBank, save2: PiggyBank, save3: PiggyBank,
  int1: Percent, int2: Percent, int3: Percent, king: Crown, compound: Sprout, payday: Briefcase,
  cushion1: Shield, cushion2: ShieldPlus, insure: ShieldCheck, steel: Dumbbell,
  hodl1: Anchor, hodl2: Anchor, div: Gift,
  nofee: BadgePercent, orders: ListChecks, lev: Rocket, scalp: Zap, average: Droplets, spread: PieChart, allin: Flame, artisan: Hammer,
  timing: Timer, undo: Undo2,
  verdict1: Ear, verdict3: SearchCheck, verdict6: ScanSearch, memo: NotebookPen, guru: MessagesSquare,
  scout1: LineChart, scout3: CandlestickChart, scout6: Telescope,
  paper1: Newspaper, paper2: Glasses, analyst1: FileBarChart, analyst2: Users,
  review: BookOpenCheck, calendar: CalendarDays,
  loan: HandCoins, eye: Eye, lotto: Ticket, jackpot: Diamond, slot: Cherry, gambler: Dices, oneshot: Crosshair, principal: GraduationCap,
  attend: CalendarCheck, sleepy: BedDouble,
  climb: ChevronsUp, last1: Footprints, last2: ArrowUpRight, chaser: Target, army: Swords, comeback: Trophy,
  semi1: Cpu, semi2: Cpu, battery1: BatteryCharging, battery2: BatteryCharging, bio1: FlaskConical, bio2: FlaskConical, crypto1: Bitcoin, crypto2: Bitcoin,
  us1: Globe, us2: Globe, us3: Earth, etf1: Layers, rule: Castle,
};

export function AugArt({ id, size }: { id: string; size: number }) {
  const C = ART[id] ?? TrendingUp;
  return <C size={size} strokeWidth={1.9} aria-hidden />;
}
