import type { ComponentType } from "react";
import { Activity, Bot, ClipboardCheck, FileText, Inbox, Mic, PhoneForwarded, Settings, TerminalSquare, Wrench } from "lucide-react";

export type View = "dashboard" | "inbox" | "agent" | "voice" | "business" | "tools" | "test" | "evaluations" | "logs" | "settings";

export type NavItem = {
  id: View;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "business", label: "Business Info", icon: FileText },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "test", label: "Test Call", icon: PhoneForwarded },
  { id: "evaluations", label: "Evaluations", icon: ClipboardCheck },
  { id: "logs", label: "Logs", icon: TerminalSquare },
  { id: "settings", label: "Settings", icon: Settings },
];
