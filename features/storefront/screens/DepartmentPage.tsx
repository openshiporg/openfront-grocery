import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import { notFound } from "next/navigation"

import { getDepartmentByHandle, getProductsByDepartment } from "@/features/storefront/lib/data/departments"
import DepartmentTemplate from "@/features/storefront/modules/departments/templates"

type Props = {
  params: Promise<{ handle: string; countryCode?: string }>;
  searchParams: Promise<{ sortBy?: string; page?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params

  try {
    const department: GroceryDepartment | null = await getDepartmentByHandle(handle)

    if (!department) {
      notFound()
    }

    return {
      title: department.name,
      description: department.description ?? `Shop our ${department.name} department.`,
      alternates: {
        canonical: `/departments/${handle}`,
      },
    }
  } catch (error) {
    console.error("Error fetching department for metadata:", error)
    notFound()
  }
}

export async function DepartmentPage(props: Props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { sortBy, page } = searchParams
  const { handle, countryCode } = params

  const department: GroceryDepartment | null = await getDepartmentByHandle(handle)

  if (!department) {
    notFound()
  }

  const { products }: { products: GroceryProduct[] } = await getProductsByDepartment(
    department.handle,
    { sortBy, page: page ? parseInt(page) : 1 }
  )

  return (
    <DepartmentTemplate
      department={department}
      products={products}
      sortBy={sortBy}
      page={page}
      countryCode={countryCode}
    />
  )
}
