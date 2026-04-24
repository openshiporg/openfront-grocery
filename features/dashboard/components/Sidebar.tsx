/**
 * Sidebar component - Navigation for Dashboard 2
 * Based on Dashboard 1 sidebar with consistent ShadCN styling and models dropdown
 */

'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Sidebar as SidebarComponent, 
  SidebarContent, 
  SidebarHeader, 
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AdminMeta } from '../hooks/useAdminMeta'
import { Home, ChevronRight, Package } from 'lucide-react'
import { Logo, LogoIcon } from '@/features/dashboard/components/Logo'
import { UserProfileClient } from './UserProfileClient'
import { OnboardingCards } from '@/features/platform/onboarding/components/OnboardingCards'
import { dismissOnboarding } from '@/features/platform/onboarding/actions/onboarding'
import { groceryPlatformNavGroups, groceryPlatformNavItems } from '@/features/platform/lib/navigation'

interface User {
  id: string;
  email: string;
  name?: string;
  onboardingStatus?: string;
  role?: {
    canManageOnboarding?: boolean;
  };
}

interface SidebarProps {
  adminMeta: AdminMeta | null
  user?: User | null
  onOpenDialog?: () => void
}

export function Sidebar({ adminMeta, user, onOpenDialog }: SidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = usePathname()

  const lists = adminMeta?.lists || {}
  const listsArray = Object.values(lists)

  // Function to check if a link is active
  const isLinkActive = React.useCallback(
    (href: string) => {
      if (!pathname) return false

      // Exact match for dashboard root
      if (href === '/dashboard' && pathname === '/dashboard') {
        return true
      }

      // For other pages, check if the pathname starts with the href
      if (href !== '/dashboard') {
        return pathname.startsWith(href)
      }

      return false
    },
    [pathname]
  )

  // Convert lists to sidebar links format
  const sidebarLinks = listsArray.map((list: any) => ({
    title: list.label,
    href: `/dashboard/${list.path}`
  }))

  // Dashboard items for the collapsible menu
  const dashboardItems = [
    {
      title: "Models",
      items: sidebarLinks,
      isActive: false,
      icon: Package,
    },
  ]

  const platformItems = groceryPlatformNavGroups.map((group) => ({
    ...group,
    items: groceryPlatformNavItems.filter((item) => item.group === group.id),
    isActive: groceryPlatformNavItems
      .filter((item) => item.group === group.id)
      .some((item) => isLinkActive(item.href)),
  }))

  return (
    <SidebarComponent collapsible="icon">
      <SidebarHeader>
        <SidebarMenuButton asChild>
          <div className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden p-2">
            <Logo />
          </div>
        </SidebarMenuButton>
        <SidebarMenuButton asChild>
          <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            <LogoIcon />
          </div>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className="no-scrollbar">
        {/* Dashboard Home Link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isLinkActive('/dashboard')}>
                <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                  <Home className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Platform Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden gap-0">
            {platformItems.map((platformItem) => (
              <Collapsible
                key={platformItem.title}
                asChild
                defaultOpen={platformItem.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <platformItem.icon className="h-4 w-4" />
                      <span>{platformItem.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {platformItem.items.map((link) => (
                        <SidebarMenuSubItem key={link.href}>
                          <SidebarMenuSubButton asChild isActive={isLinkActive(link.href)}>
                            <Link href={link.href} onClick={() => setOpenMobile(false)}>
                              <span>{link.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}
          </SidebarMenu>

          <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            {platformItems.map((platformItem) => (
              <DropdownMenu key={platformItem.title}>
                <SidebarMenuItem>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <platformItem.icon className="h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                    className="min-w-56"
                  >
                    <div className="max-h-[calc(100vh-16rem)] overflow-y-auto py-1">
                      {platformItem.items.map((link) => (
                        <DropdownMenuItem
                          asChild
                          key={link.href}
                          className={isLinkActive(link.href) ? "bg-blue-50 text-blue-600" : ""}
                        >
                          <Link href={link.href} onClick={() => setOpenMobile(false)}>
                            <span>{link.title}</span>
                            {isLinkActive(link.href) && (
                              <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                            )}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </SidebarMenuItem>
              </DropdownMenu>
            ))}
          </div>
        </SidebarGroup>

        {/* Models Dropdown - Collapsible */}
        {dashboardItems.map((dashboardItem) => (
        <SidebarGroup key={dashboardItem.title}>
          <SidebarMenu>
            <SidebarGroupLabel>{dashboardItem.title}</SidebarGroupLabel>
            <div className="max-h-full overflow-y-auto group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden">
              <Collapsible
                key={dashboardItem.title}
                asChild
                defaultOpen={dashboardItem.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <dashboardItem.icon className="h-4 w-4" />
                      <span>{dashboardItem.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {dashboardItem.items.map((link) => {
                        const handleClick = (e: React.MouseEvent) => {
                          setOpenMobile(false)
                        }

                        return (
                          <SidebarMenuSubItem key={link.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isLinkActive(link.href)}
                            >
                              <Link href={link.href} onClick={handleClick}>
                                <span>{link.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </div>

            {/* Models Dropdown - Icon Mode */}
            <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
              <DropdownMenu>
                <SidebarMenuItem>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <dashboardItem.icon className="h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                    className="min-w-56"
                  >
                    <div className="max-h-[calc(100vh-16rem)] overflow-y-auto py-1">
                      {dashboardItem.items.map((link) => {
                        const handleClick = (e: React.MouseEvent) => {
                          setOpenMobile(false)
                        }

                        return (
                          <DropdownMenuItem
                            asChild
                            key={link.href}
                            className={
                              isLinkActive(link.href)
                                ? "bg-blue-50 text-blue-600"
                                : ""
                            }
                          >
                            <Link href={link.href} onClick={handleClick}>
                              <span>{link.title}</span>
                              {isLinkActive(link.href) && (
                                <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                              )}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </div>
                  </DropdownMenuContent>
                </SidebarMenuItem>
              </DropdownMenu>
            </div>
           </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      
      <SidebarFooter>
        {user && (
          <div className="space-y-3">
            <OnboardingCards
              steps={[
                {
                  href: '/dashboard/onboarding',
                  title: 'Complete store setup',
                  description: 'Seed your grocery demo data and unlock the core operator and storefront flows.',
                },
              ]}
              onboardingStatus={user.onboardingStatus}
              userRole={user.role}
              onDismiss={() => {
                void dismissOnboarding()
              }}
              onOpenDialog={() => onOpenDialog?.()}
            />
            <UserProfileClient user={user} />
          </div>
        )}
      </SidebarFooter>
      
      <SidebarRail />
    </SidebarComponent>
  )
}