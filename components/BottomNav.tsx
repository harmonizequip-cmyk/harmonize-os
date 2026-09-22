"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  Wallet,
  CalendarDays,
  Menu,
  X,
  Users,
  ListChecks,
  Package,
  BarChart3,
  History,
  Settings,
} from "lucide-react";

// Os 4 atalhos de uso diário, nessa ordem. O 5º e último botão não é um
// link, é o gatilho do menu com o restante (ver MORE_ITEMS).
const MAIN_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/agenda", label:
