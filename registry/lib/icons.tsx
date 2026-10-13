/**
 * Словник іконок erp-ui (SPEC §6.5, рішення власника 13.10.2026): поняття → іконка lucide.
 *
 * - Модулі (A1…T1, LC01…LC12), статуси, дії з документами й елементи оболонки беруть іконку лише звідси:
 *   однакове поняття — однакова іконка в усіх проектах.
 * - Гривня — власна іконка `HryvniaIcon` у стилі lucide (сітка 24, обведення, круглі кінці).
 * - Товщина лінії одна на весь застосунок: `ICON_STROKE_WIDTH`, задається `IconProvider`.
 * - Назви модулів — у рядках кіта (`modules.<ID>`), іконки декоративні: поруч завжди є підпис.
 */
import {
  Activity,
  AppWindow,
  Archive,
  ArchiveRestore,
  Armchair,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpDown,
  Award,
  BadgeCheck,
  Ban,
  Banknote,
  Bell,
  Blocks,
  BookMarked,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Cable,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  Car,
  ChartColumn,
  ChartPie,
  Check,
  CheckCheck,
  CircleCheck,
  CircleHelp,
  CircleUser,
  CircleX,
  ClipboardList,
  Clock,
  Cog,
  Coins,
  Combine,
  Copy,
  CreditCard,
  DoorOpen,
  Download,
  Ellipsis,
  Factory,
  FileCheck,
  FileDown,
  FilePen,
  FilePlus2,
  FileSearch,
  FileSignature,
  FileStack,
  FileText,
  FileUp,
  FolderKanban,
  FolderOpen,
  Funnel,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Handshake,
  Headset,
  History,
  IdCard,
  Info,
  KeyRound,
  Keyboard,
  Landmark,
  Languages,
  Layers,
  LayoutDashboard,
  Leaf,
  LifeBuoy,
  Link,
  ListChecks,
  ListFilter,
  ListTree,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Mails,
  MapPin,
  MapPinned,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  MessagesSquare,
  Monitor,
  Moon,
  Nfc,
  NotebookPen,
  Package,
  PackageCheck,
  Palette,
  PanelLeft,
  Paperclip,
  PenTool,
  Pencil,
  Percent,
  PiggyBank,
  PlugZap,
  Plus,
  Printer,
  Puzzle,
  Receipt,
  ReceiptText,
  RefreshCw,
  Repeat,
  Route,
  Rows3,
  Save,
  Scale,
  ScanBarcode,
  Search,
  Send,
  Settings,
  Shapes,
  Share2,
  Sheet,
  ShoppingBag,
  Signature,
  Sparkles,
  Store,
  Sun,
  Ticket,
  Timer,
  Trash2,
  TreePalm,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  UserCog,
  UserPlus,
  UserSearch,
  Users,
  Vault,
  Wallet,
  Warehouse,
  WifiOff,
  Workflow,
  Wrench,
  X,
  Zap,
  createLucideIcon,
  LucideProvider,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

/** Товщина лінії іконок у всьому застосунку. */
export const ICON_STROKE_WIDTH = 2

/** Задає однакову товщину лінії всім іконкам lucide всередині. Обгорніть застосунок один раз. */
export function IconProvider({
  children,
  strokeWidth = ICON_STROKE_WIDTH,
}: {
  children: ReactNode
  strokeWidth?: number
}) {
  return <LucideProvider strokeWidth={strokeWidth}>{children}</LucideProvider>
}

/** Гривня ₴ у стилі lucide: дзеркальна S і дві горизонтальні риски. */
export const HryvniaIcon: LucideIcon = createLucideIcon({
  name: "hryvnia",
  size: 24,
  node: [
    [
      "path",
      {
        d: "M7 6.5C8 4.9 9.8 4 12 4c2.8 0 5 1.6 5 4 0 2.4-2.6 3.4-5 4s-5 1.6-5 4c0 2.4 2.2 4 5 4 2.2 0 4-.9 5-2.5",
        key: "hryvnia-s",
      },
    ],
    ["path", { d: "M6 10h12", key: "hryvnia-top" }],
    ["path", { d: "M6 14h12", key: "hryvnia-bottom" }],
  ],
})

export type ModuleId =
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6"
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "B7"
  | "B8"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "E1"
  | "E2"
  | "E3"
  | "E4"
  | "E5"
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "G1"
  | "G2"
  | "G3"
  | "G4"
  | "G5"
  | "G6"
  | "G7"
  | "G8"
  | "G9"
  | "H1"
  | "H2"
  | "H3"
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "I6"
  | "I7"
  | "J1"
  | "J2"
  | "J3"
  | "J4"
  | "J5"
  | "J6"
  | "J7"
  | "J8"
  | "K1"
  | "K2"
  | "K3"
  | "K4"
  | "K5"
  | "K6"
  | "K7"
  | "K8"
  | "K9"
  | "K10"
  | "K11"
  | "K12"
  | "L1"
  | "M1"
  | "M2"
  | "M3"
  | "M4"
  | "M5"
  | "N1"
  | "N2"
  | "N3"
  | "N4"
  | "N5"
  | "N6"
  | "O1"
  | "P1"
  | "P2"
  | "P3"
  | "Q1"
  | "R1"
  | "S1"
  | "T1"
  | "LC01"
  | "LC02"
  | "LC03"
  | "LC04"
  | "LC05"
  | "LC06"
  | "LC07"
  | "LC08"
  | "LC09"
  | "LC10"
  | "LC11"
  | "LC12"

/** Модулі SPEC §14–15 → іконка. */
export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  A1: Building2,
  A2: UserCog,
  A3: Blocks,
  A4: ArrowRightLeft,
  A5: History,
  A6: Settings,
  B1: Users,
  B2: Funnel,
  B3: ClipboardList,
  B4: Puzzle,
  B5: HandCoins,
  B6: FileSignature,
  B7: Headset,
  B8: MessagesSquare,
  C1: Mails,
  C2: Workflow,
  C3: Share2,
  C4: Ticket,
  C5: ListChecks,
  D1: Globe,
  D2: Store,
  D3: PlugZap,
  D4: Calculator,
  E1: FilePlus2,
  E2: FileSearch,
  E3: PackageCheck,
  E4: Handshake,
  E5: Coins,
  F1: Package,
  F2: Warehouse,
  F3: ScanBarcode,
  F4: Truck,
  F5: Boxes,
  G1: ListTree,
  G2: Factory,
  G3: CalendarClock,
  G4: Cog,
  G5: ArrowLeftRight,
  G6: BadgeCheck,
  G7: Wrench,
  G8: Layers,
  G9: Hammer,
  H1: TrendingUp,
  H2: Car,
  H3: KeyRound,
  I1: FolderKanban,
  I2: Timer,
  I3: CalendarRange,
  I4: ChartPie,
  I5: CalendarPlus,
  I6: LifeBuoy,
  I7: MapPin,
  J1: IdCard,
  J2: UserPlus,
  J3: TreePalm,
  J4: Clock,
  J5: Wallet,
  J6: Award,
  J7: ReceiptText,
  J8: GraduationCap,
  K1: BookOpen,
  K2: FileText,
  K3: FileDown,
  K4: CreditCard,
  K5: Landmark,
  K6: Percent,
  K7: Armchair,
  K8: PiggyBank,
  K9: Combine,
  K10: CalendarCheck,
  K11: ChartColumn,
  K12: Vault,
  L1: Repeat,
  M1: FolderOpen,
  M2: Signature,
  M3: BookMarked,
  M4: Sheet,
  M5: Leaf,
  N1: Activity,
  N2: Mail,
  N3: Calendar,
  N4: MessageCircle,
  N5: Bell,
  N6: NotebookPen,
  O1: LayoutDashboard,
  P1: Route,
  P2: Zap,
  P3: AppWindow,
  Q1: DoorOpen,
  R1: Cable,
  S1: Sparkles,
  T1: Shapes,
  LC01: FileCheck,
  LC02: PenTool,
  LC03: FileStack,
  LC04: Receipt,
  LC05: Banknote,
  LC06: Nfc,
  LC07: MapPinned,
  LC08: ShoppingBag,
  LC09: UserSearch,
  LC10: MessageCircle,
  LC11: Briefcase,
  LC12: Scale,
}

export const MODULE_IDS = Object.keys(MODULE_ICONS) as ModuleId[]

/** Статуси (SPEC §6.3): іконка завжди поруч із підписом і кольором. */
export const STATUS_ICONS = {
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleX,
  info: Info,
  pending: Clock,
  draft: FilePen,
  archived: Archive,
  locked: Lock,
  syncing: RefreshCw,
  offline: WifiOff,
} satisfies Record<string, LucideIcon>

export type StatusIcon = keyof typeof STATUS_ICONS

/** Дії із записами й документами (PF03). */
export const ACTION_ICONS = {
  create: Plus,
  edit: Pencil,
  duplicate: Copy,
  delete: Trash2,
  save: Save,
  submit: CheckCheck,
  approve: Check,
  reject: X,
  cancelDocument: Ban,
  amend: FilePen,
  reverse: Undo2,
  print: Printer,
  download: Download,
  import: FileUp,
  send: Send,
  email: Mail,
  attach: Paperclip,
  comment: MessageSquarePlus,
  share: Share2,
  archive: Archive,
  restore: ArchiveRestore,
  lock: Lock,
  unlock: LockOpen,
  sign: Signature,
  fiscalize: ReceiptText,
  scan: ScanBarcode,
  history: History,
  filter: ListFilter,
  sort: ArrowUpDown,
  search: Search,
  refresh: RefreshCw,
  link: Link,
  more: Ellipsis,
  settings: Settings,
} satisfies Record<string, LucideIcon>

export type ActionIcon = keyof typeof ACTION_ICONS

/** Оболонка застосунку. */
export const SHELL_ICONS = {
  menu: Menu,
  sidebar: PanelLeft,
  notifications: Bell,
  user: CircleUser,
  company: Building2,
  signOut: LogOut,
  palette: Palette,
  themeLight: Sun,
  themeDark: Moon,
  themeSystem: Monitor,
  density: Rows3,
  language: Languages,
  help: CircleHelp,
  shortcuts: Keyboard,
} satisfies Record<string, LucideIcon>
