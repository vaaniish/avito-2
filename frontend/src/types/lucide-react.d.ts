declare module "lucide-react" {
  import type { FC, SVGProps } from "react";

  export type LucideProps = SVGProps<SVGSVGElement> & {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  };

  export type LucideIcon = FC<LucideProps>;

  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowDown: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowUp: LucideIcon;
  export const Ban: LucideIcon;
  export const Bell: LucideIcon;
  export const Calendar: LucideIcon;
  export const Camera: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const CircleX: LucideIcon;
  export const Clock: LucideIcon;
  export const CreditCard: LucideIcon;
  export const Download: LucideIcon;
  export const Edit2: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Heart: LucideIcon;
  export const Info: LucideIcon;
  export const Loader2: LucideIcon;
  export const LogOut: LucideIcon;
  export const MapPin: LucideIcon;
  export const Menu: LucideIcon;
  export const MessageCircle: LucideIcon;
  export const Minus: LucideIcon;
  export const Plus: LucideIcon;
  export const QrCode: LucideIcon;
  export const RefreshCcw: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Search: LucideIcon;
  export const Send: LucideIcon;
  export const Shield: LucideIcon;
  export const ShieldOff: LucideIcon;
  export const ShoppingCart: LucideIcon;
  export const SlidersHorizontal: LucideIcon;
  export const Star: LucideIcon;
  export const Trash2: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const X: LucideIcon;
  export const XCircle: LucideIcon;
  export const XIcon: LucideIcon;

  export const BadgePercent: LucideIcon;
  export const ClipboardList: LucideIcon;
  export const FileText: LucideIcon;
  export const ListPlus: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const UserCheck: LucideIcon;

  export const BookOpen: LucideIcon;
  export const Box: LucideIcon;
  export const Cpu: LucideIcon;
  export const Gamepad2: LucideIcon;
  export const Headphones: LucideIcon;
  export const Home: LucideIcon;
  export const Laptop: LucideIcon;
  export const Monitor: LucideIcon;
  export const Shirt: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Tv: LucideIcon;
  export const WashingMachine: LucideIcon;
  export const Wifi: LucideIcon;

  export const GripVertical: LucideIcon;
  export const Pencil: LucideIcon;
  export const PlusCircle: LucideIcon;
  export const Trash: LucideIcon;

  export const ChevronLeft: LucideIcon;
  export const Flag: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const ThumbsUp: LucideIcon;
  export const Zap: LucideIcon;
  export const PackageOpen: LucideIcon;
  export const Store: LucideIcon;
  export const History: LucideIcon;
  export const MessageCircleQuestion: LucideIcon;
  export const Truck: LucideIcon;
  export const Upload: LucideIcon;

  export function createLucideIcon(
    iconName: string,
    iconNode: ReadonlyArray<
      readonly [elementName: string, attrs: Record<string, string | number>]
    >,
  ): LucideIcon;
}
