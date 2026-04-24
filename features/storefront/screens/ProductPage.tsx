import type { GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import { notFound } from "next/navigation"

import { getProductByHandle } from "@/features/storefront/lib/data/products"
import ProductTemplate from "@/features/storefront/modules/products/templates"

type Props = {
  params: Promise<{ slug: string; countryCode?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { slug } = params

  try {
    const product: GroceryProduct | null = await getProductByHandle(slug)

    if (!product) {
      notFound()
    }

    return {
      title: product.name,
      description: product.description ?? `${product.name} - Fresh from our store.`,
      alternates: {
        canonical: `/products/${slug}`,
      },
    }
  } catch (error) {
    console.error("Error fetching product for metadata:", error)
    notFound()
  }
}

export async function ProductPage(props: Props) {
  const params = await props.params
  const { slug, countryCode } = params

  const product: GroceryProduct | null = await getProductByHandle(slug)

  if (!product) {
    notFound()
  }

  return (
    <ProductTemplate
      product={product}
      countryCode={countryCode}
    />
  )
}
