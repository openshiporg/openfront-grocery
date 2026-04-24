import type { Metadata } from 'next';
import Link from 'next/link';

import { getDepartmentsList } from "@/features/storefront/lib/data/departments"
import type { GroceryDepartment } from "@/features/storefront/types"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shop by Department | Openfront Grocery",
    description: "Browse all grocery departments - produce, meat, dairy, bakery, frozen, and more.",
  }
}

// Department icons and colors
const departmentStyles: Record<string, { icon: string; bgColor: string; description: string }> = {
  produce: {
    icon: '🥬',
    bgColor: 'bg-green-50 hover:bg-green-100',
    description: 'Fresh fruits and vegetables'
  },
  meat: {
    icon: '🥩',
    bgColor: 'bg-red-50 hover:bg-red-100',
    description: 'Quality meats and poultry'
  },
  seafood: {
    icon: '🦐',
    bgColor: 'bg-cyan-50 hover:bg-cyan-100',
    description: 'Fresh fish and seafood'
  },
  dairy: {
    icon: '🥛',
    bgColor: 'bg-blue-50 hover:bg-blue-100',
    description: 'Milk, cheese, yogurt, and eggs'
  },
  bakery: {
    icon: '🍞',
    bgColor: 'bg-amber-50 hover:bg-amber-100',
    description: 'Fresh baked breads and pastries'
  },
  frozen: {
    icon: '🧊',
    bgColor: 'bg-sky-50 hover:bg-sky-100',
    description: 'Frozen meals, vegetables, and desserts'
  },
  pantry: {
    icon: '🥫',
    bgColor: 'bg-orange-50 hover:bg-orange-100',
    description: 'Canned goods, pasta, rice, and more'
  },
  beverages: {
    icon: '🥤',
    bgColor: 'bg-purple-50 hover:bg-purple-100',
    description: 'Drinks, juices, and water'
  },
  snacks: {
    icon: '🍿',
    bgColor: 'bg-yellow-50 hover:bg-yellow-100',
    description: 'Chips, cookies, and treats'
  },
  deli: {
    icon: '🥪',
    bgColor: 'bg-rose-50 hover:bg-rose-100',
    description: 'Prepared foods and deli meats'
  },
  organic: {
    icon: '🌱',
    bgColor: 'bg-emerald-50 hover:bg-emerald-100',
    description: 'Organic and natural products'
  },
  international: {
    icon: '🌍',
    bgColor: 'bg-indigo-50 hover:bg-indigo-100',
    description: 'International and specialty foods'
  },
};

export async function DepartmentsPage(props: {
  params: Promise<{ countryCode?: string }>
}) {
  await props.params

  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 20)

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Departments</span>
      </nav>

      <h1 className="text-3xl font-bold text-foreground mb-2">Shop by Department</h1>
      <p className="text-muted-foreground mb-8">
        Browse our wide selection of fresh groceries organized by department
      </p>

      {departments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {departments.map((department) => {
            const style = departmentStyles[department.handle] || {
              icon: '📦',
              bgColor: 'bg-gray-50 hover:bg-gray-100',
              description: department.description || 'Shop this department'
            };

            return (
              <Link
                key={department.id}
                href={`/departments/${department.handle}`}
                className={`${style.bgColor} rounded-lg p-6 transition-all duration-200 hover:shadow-md`}
              >
                <span className="text-5xl block mb-4">{style.icon}</span>
                <h2 className="font-semibold text-lg text-foreground mb-1">
                  {department.name}
                </h2>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {department.description || style.description}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No departments available.</p>
        </div>
      )}
    </div>
  );
}
