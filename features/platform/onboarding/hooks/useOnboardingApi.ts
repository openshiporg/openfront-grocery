import { GraphQLClient, gql } from 'graphql-request';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import type { SeedSectionKey, TemplateType } from '../config/templates';
import type { OnboardingStep } from './useOnboardingState';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: SeedSectionKey, item: string) => void;
  setItemCompleted: (type: SeedSectionKey, item: string) => void;
  setItemError: (type: SeedSectionKey, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

type ProductMap = Record<
  string,
  {
    id: string;
    title: string;
    sku?: string;
    price: number;
    imageUrl?: string;
  }
>;

const timeWindowHours: Record<string, { hour: number; minute?: number }> = {
  time_8_10: { hour: 8 },
  time_10_12: { hour: 10 },
  time_12_14: { hour: 12 },
  time_14_16: { hour: 14 },
  time_16_18: { hour: 16 },
  time_18_20: { hour: 18 },
};

function formatError(error: any) {
  if (error?.response?.errors?.length) {
    return error.response.errors.map((item: any) => item.message).join('\n');
  }
  return error?.message || 'Unknown error';
}

function relativeDate(daysOffset: number, hour = 12, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function startOfDayOffset(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

async function getAuthenticatedUserId(client: GraphQLClient) {
  const query = gql`
    query GetAuthenticatedUserId {
      authenticatedItem {
        ... on User {
          id
        }
      }
    }
  `;

  const result = (await client.request(query)) as {
    authenticatedItem?: { id: string } | null;
  };

  return result.authenticatedItem?.id || null;
}

export function useOnboardingApi({
  currentJsonData,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {
  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Starting grocery onboarding...');

    try {
      await startOnboarding();
    } catch (error) {
      console.error('Error marking onboarding as started:', error);
    }

    try {
      const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
        headers: { 'Content-Type': 'application/json' },
      });

      const authenticatedUserId = await getAuthenticatedUserId(client);
      if (!authenticatedUserId) {
        throw new Error('You must be signed in to run onboarding.');
      }

      const departments = await seedDepartments(client, currentJsonData.departments || []);
      const suppliers = await seedSuppliers(client, currentJsonData.suppliers || []);
      const products = await seedProducts(client, currentJsonData.products || [], departments, suppliers);
      await seedInventoryLots(client, currentJsonData.inventoryLots || [], products, suppliers);
      await seedDeliverySlots(client, currentJsonData.deliverySlots || []);
      await seedPickupSlots(client, currentJsonData.pickupSlots || []);
      await seedParkingSpots(client, currentJsonData.parkingSpots || []);
      await seedPaymentProviders(client, currentJsonData.paymentProviders || []);
      await seedCoupons(client, currentJsonData.coupons || []);
      await seedLoyaltyPrograms(client, currentJsonData.loyaltyPrograms || []);
      const customers = await seedCustomers(client, currentJsonData.customers || []);
      await seedOrders(client, currentJsonData.orders || [], customers, products);

      setProgress('Grocery onboarding complete!');
      await completeOnboarding();
      setStep('done');
    } catch (error: any) {
      const message = formatError(error);
      setError(message);
      console.error('Error during onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const seedDepartments = async (client: GraphQLClient, departments: any[]) => {
    setProgress('Creating departments...');
    const created: Record<string, string> = {};

    for (const department of departments) {
      const itemName = department.name || department.handle;
      setItemLoading('departments', itemName);

      try {
        const lookup = gql`
          query FindDepartment($handle: String!) {
            departments(where: { handle: { equals: $handle } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { handle: department.handle })) as {
          departments: Array<{ id: string }>;
        };

        if (existing.departments[0]) {
          created[department.handle] = existing.departments[0].id;
        } else {
          const mutation = gql`
            mutation CreateDepartment($data: DepartmentCreateInput!) {
              createDepartment(data: $data) {
                id
              }
            }
          `;
          const result = (await client.request(mutation, {
            data: {
              name: department.name,
              handle: department.handle,
              description: department.description,
              imageUrl: department.imageUrl,
              sortOrder: department.sortOrder,
              isActive: true,
              temperatureZone: department.temperatureZone,
              requiredLicenses: department.requiredLicenses || [],
            },
          })) as { createDepartment: { id: string } };
          created[department.handle] = result.createDepartment.id;
        }

        setItemCompleted('departments', itemName);
      } catch (error) {
        setItemError('departments', itemName, formatError(error));
      }
    }

    return created;
  };

  const seedSuppliers = async (client: GraphQLClient, suppliers: any[]) => {
    setProgress('Creating suppliers...');
    const created: Record<string, string> = {};

    for (const supplier of suppliers) {
      const itemName = supplier.name || supplier.email;
      setItemLoading('suppliers', itemName);

      try {
        const lookup = gql`
          query FindSupplier($email: String!) {
            suppliers(where: { email: { equals: $email } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { email: supplier.email })) as {
          suppliers: Array<{ id: string }>;
        };

        if (existing.suppliers[0]) {
          created[supplier.email] = existing.suppliers[0].id;
        } else {
          const mutation = gql`
            mutation CreateSupplier($data: SupplierCreateInput!) {
              createSupplier(data: $data) {
                id
              }
            }
          `;
          const result = (await client.request(mutation, {
            data: {
              name: supplier.name,
              contactName: supplier.contactName,
              email: supplier.email,
              phone: supplier.phone,
              paymentTerms: supplier.paymentTerms,
              deliveryDays: supplier.deliveryDays || [],
              minimumOrder: supplier.minimumOrder,
            },
          })) as { createSupplier: { id: string } };
          created[supplier.email] = result.createSupplier.id;
        }

        setItemCompleted('suppliers', itemName);
      } catch (error) {
        setItemError('suppliers', itemName, formatError(error));
      }
    }

    return created;
  };

  const seedProducts = async (
    client: GraphQLClient,
    products: any[],
    departments: Record<string, string>,
    suppliers: Record<string, string>
  ) => {
    setProgress('Creating products...');
    const created: ProductMap = {};

    for (const product of products) {
      const itemName = product.title || product.handle;
      setItemLoading('products', itemName);

      try {
        const lookup = gql`
          query FindProduct($handle: String!) {
            products(where: { handle: { equals: $handle } }, take: 1) {
              id
              title
              sku
              price
              imageUrl
            }
          }
        `;
        const existing = (await client.request(lookup, { handle: product.handle })) as {
          products: Array<{
            id: string;
            title: string;
            sku?: string;
            price: number;
            imageUrl?: string;
          }>;
        };

        if (existing.products[0]) {
          created[product.handle] = existing.products[0];
        } else {
          const mutation = gql`
            mutation CreateProduct($data: ProductCreateInput!) {
              createProduct(data: $data) {
                id
                title
                sku
                price
                imageUrl
              }
            }
          `;
          const result = (await client.request(mutation, {
            data: {
              title: product.title,
              handle: product.handle,
              sku: product.sku,
              status: product.status,
              price: product.price,
              compareAtPrice: product.compareAtPrice,
              costPrice: product.costPrice,
              inStock: product.inStock,
              stockQuantity: product.stockQuantity,
              lowStockThreshold: product.lowStockThreshold,
              imageUrl: product.imageUrl,
              thumbnailUrl: product.thumbnailUrl,
              department: product.departmentCode,
              isPerishable: product.isPerishable,
              shelfLife: product.shelfLife,
              pricingMethod: product.pricingMethod,
              unitOfMeasure: product.unitOfMeasure,
              organicCertified: product.organicCertified,
              allergens: product.allergens || [],
              departmentRef: departments[product.departmentHandle]
                ? { connect: { id: departments[product.departmentHandle] } }
                : undefined,
              supplier: suppliers[product.supplierEmail]
                ? { connect: { id: suppliers[product.supplierEmail] } }
                : undefined,
            },
          })) as {
            createProduct: {
              id: string;
              title: string;
              sku?: string;
              price: number;
              imageUrl?: string;
            };
          };

          created[product.handle] = result.createProduct;
        }

        setItemCompleted('products', itemName);
      } catch (error) {
        setItemError('products', itemName, formatError(error));
      }
    }

    return created;
  };

  const seedInventoryLots = async (
    client: GraphQLClient,
    lots: any[],
    products: ProductMap,
    suppliers: Record<string, string>
  ) => {
    setProgress('Creating inventory lots...');

    for (const lot of lots) {
      const itemName = lot.lotNumber;
      setItemLoading('inventoryLots', itemName);

      try {
        const lookup = gql`
          query FindInventoryLot($lotNumber: String!) {
            inventoryLots(where: { lotNumber: { equals: $lotNumber } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { lotNumber: lot.lotNumber })) as {
          inventoryLots: Array<{ id: string }>;
        };

        if (!existing.inventoryLots[0]) {
          const mutation = gql`
            mutation CreateInventoryLot($data: InventoryLotCreateInput!) {
              createInventoryLot(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              lotNumber: lot.lotNumber,
              expirationDate: relativeDate(lot.expirationOffsetDays, 12),
              receivedDate: relativeDate(lot.receivedOffsetDays, 9),
              quantity: lot.quantity,
              quantityRemaining: lot.quantityRemaining,
              costPerUnit: lot.costPerUnit,
              location: lot.location,
              product: products[lot.productHandle]
                ? { connect: { id: products[lot.productHandle].id } }
                : undefined,
              supplier: suppliers[lot.supplierEmail]
                ? { connect: { id: suppliers[lot.supplierEmail] } }
                : undefined,
            },
          });
        }

        setItemCompleted('inventoryLots', itemName);
      } catch (error) {
        setItemError('inventoryLots', itemName, formatError(error));
      }
    }
  };

  const seedDeliverySlots = async (client: GraphQLClient, slots: any[]) => {
    setProgress('Creating delivery slots...');

    for (const slot of slots) {
      setItemLoading('deliverySlots', slot.label);
      const slotDate = startOfDayOffset(slot.dayOffset);

      try {
        const lookup = gql`
          query FindDeliverySlot($date: DateTime!, $startTime: String!, $endTime: String!) {
            deliverySlots(
              where: {
                date: { equals: $date }
                startTime: { equals: $startTime }
                endTime: { equals: $endTime }
              }
              take: 1
            ) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, {
          date: slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })) as { deliverySlots: Array<{ id: string }> };

        if (!existing.deliverySlots[0]) {
          const mutation = gql`
            mutation CreateDeliverySlot($data: DeliverySlotCreateInput!) {
              createDeliverySlot(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              date: slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
              capacity: slot.capacity,
              currentBookings: slot.currentBookings,
              isActive: slot.isActive,
              deliveryFee: slot.deliveryFee,
            },
          });
        }

        setItemCompleted('deliverySlots', slot.label);
      } catch (error) {
        setItemError('deliverySlots', slot.label, formatError(error));
      }
    }
  };

  const seedPickupSlots = async (client: GraphQLClient, slots: any[]) => {
    setProgress('Creating pickup slots...');

    for (const slot of slots) {
      setItemLoading('pickupSlots', slot.label);
      const slotDate = startOfDayOffset(slot.dayOffset);

      try {
        const lookup = gql`
          query FindPickupSlot($date: DateTime!, $startTime: String!, $endTime: String!) {
            pickupSlots(
              where: {
                date: { equals: $date }
                startTime: { equals: $startTime }
                endTime: { equals: $endTime }
              }
              take: 1
            ) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, {
          date: slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })) as { pickupSlots: Array<{ id: string }> };

        if (!existing.pickupSlots[0]) {
          const mutation = gql`
            mutation CreatePickupSlot($data: PickupSlotCreateInput!) {
              createPickupSlot(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              date: slotDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
              maxOrders: slot.maxOrders,
              currentOrders: slot.currentOrders,
              isAvailable: slot.isAvailable,
            },
          });
        }

        setItemCompleted('pickupSlots', slot.label);
      } catch (error) {
        setItemError('pickupSlots', slot.label, formatError(error));
      }
    }
  };

  const seedParkingSpots = async (client: GraphQLClient, spots: any[]) => {
    setProgress('Creating curbside parking spots...');

    for (const spot of spots) {
      setItemLoading('parkingSpots', spot.spotNumber);

      try {
        const lookup = gql`
          query FindParkingSpot($spotNumber: String!) {
            parkingSpots(where: { spotNumber: { equals: $spotNumber } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { spotNumber: spot.spotNumber })) as {
          parkingSpots: Array<{ id: string }>;
        };

        if (!existing.parkingSpots[0]) {
          const mutation = gql`
            mutation CreateParkingSpot($data: ParkingSpotCreateInput!) {
              createParkingSpot(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              spotNumber: spot.spotNumber,
              description: spot.description,
              isAccessible: spot.isAccessible,
              isAvailable: spot.isAvailable,
            },
          });
        }

        setItemCompleted('parkingSpots', spot.spotNumber);
      } catch (error) {
        setItemError('parkingSpots', spot.spotNumber, formatError(error));
      }
    }
  };

  const seedPaymentProviders = async (client: GraphQLClient, providers: any[]) => {
    setProgress('Creating payment providers...');

    for (const provider of providers) {
      const itemName = provider.name || provider.code;
      setItemLoading('paymentProviders', itemName);

      try {
        const lookup = gql`
          query FindPaymentProvider($code: String!) {
            paymentProviders(where: { code: { equals: $code } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { code: provider.code })) as {
          paymentProviders: Array<{ id: string }>;
        };

        if (!existing.paymentProviders[0]) {
          const mutation = gql`
            mutation CreatePaymentProvider($data: PaymentProviderCreateInput!) {
              createPaymentProvider(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              name: provider.name,
              code: provider.code,
              isInstalled: provider.isInstalled,
              credentials: provider.credentials || {},
              metadata: provider.metadata || {},
              createPaymentFunction: provider.createPaymentFunction,
              capturePaymentFunction: provider.capturePaymentFunction,
              refundPaymentFunction: provider.refundPaymentFunction,
              getPaymentStatusFunction: provider.getPaymentStatusFunction,
              generatePaymentLinkFunction: provider.generatePaymentLinkFunction,
              handleWebhookFunction: provider.handleWebhookFunction,
            },
          });
        }

        setItemCompleted('paymentProviders', itemName);
      } catch (error) {
        setItemError('paymentProviders', itemName, formatError(error));
      }
    }
  };

  const seedCoupons = async (client: GraphQLClient, coupons: any[]) => {
    setProgress('Creating coupons...');

    for (const coupon of coupons) {
      setItemLoading('coupons', coupon.code);

      try {
        const lookup = gql`
          query FindCoupon($code: String!) {
            coupons(where: { code: { equals: $code } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { code: coupon.code })) as {
          coupons: Array<{ id: string }>;
        };

        if (!existing.coupons[0]) {
          const mutation = gql`
            mutation CreateCoupon($data: CouponCreateInput!) {
              createCoupon(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              code: coupon.code,
              discountType: coupon.discountType,
              discountValue: coupon.discountValue,
              minPurchase: coupon.minPurchase,
              maxUses: coupon.maxUses,
              currentUses: coupon.currentUses || 0,
              validFrom: relativeDate(coupon.validFromOffsetDays || 0, 0),
              validTo: relativeDate(coupon.validToOffsetDays || 14, 23, 59),
              productCategories: coupon.productCategories || [],
              excludedProducts: coupon.excludedProducts || [],
              isActive: coupon.isActive,
            },
          });
        }

        setItemCompleted('coupons', coupon.code);
      } catch (error) {
        setItemError('coupons', coupon.code, formatError(error));
      }
    }
  };

  const seedLoyaltyPrograms = async (client: GraphQLClient, programs: any[]) => {
    setProgress('Creating loyalty programs...');

    for (const program of programs) {
      setItemLoading('loyaltyPrograms', program.name);

      try {
        const lookup = gql`
          query FindLoyaltyProgram($name: String!) {
            loyaltyPrograms(where: { name: { equals: $name } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { name: program.name })) as {
          loyaltyPrograms: Array<{ id: string }>;
        };

        if (!existing.loyaltyPrograms[0]) {
          const mutation = gql`
            mutation CreateLoyaltyProgram($data: LoyaltyProgramCreateInput!) {
              createLoyaltyProgram(data: $data) {
                id
              }
            }
          `;
          await client.request(mutation, {
            data: {
              name: program.name,
              pointsPerDollar: program.pointsPerDollar,
              tierConfiguration: program.tierConfiguration,
              redemptionRules: program.redemptionRules,
              expirationRules: program.expirationRules,
              tierBenefits: program.tierBenefits,
              isActive: program.isActive,
            },
          });
        }

        setItemCompleted('loyaltyPrograms', program.name);
      } catch (error) {
        setItemError('loyaltyPrograms', program.name, formatError(error));
      }
    }
  };

  const seedCustomers = async (client: GraphQLClient, customers: any[]) => {
    setProgress('Creating customer accounts and preferences...');
    const createdUsers: Record<string, { id: string; addressIds: Record<string, string> }> = {};

    for (const customer of customers) {
      const itemName = customer.name || customer.email;
      setItemLoading('customers', itemName);

      try {
        const lookup = gql`
          query FindUser($email: String!) {
            users(where: { email: { equals: $email } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { email: customer.email })) as {
          users: Array<{ id: string }>;
        };

        let userId = existing.users[0]?.id;

        if (!userId) {
          const mutation = gql`
            mutation CreateUser($data: UserCreateInput!) {
              createUser(data: $data) {
                id
              }
            }
          `;
          const result = (await client.request(mutation, {
            data: {
              name: customer.name,
              email: customer.email,
              password: customer.password,
            },
          })) as { createUser: { id: string } };
          userId = result.createUser.id;
        }

        const addressIds: Record<string, string> = {};

        for (const address of customer.addresses || []) {
          const addressLookup = gql`
            query FindAddress($userId: ID!, $address1: String!, $postalCode: String!) {
              addresses(
                where: {
                  user: { id: { equals: $userId } }
                  address1: { equals: $address1 }
                  postalCode: { equals: $postalCode }
                }
                take: 1
              ) {
                id
              }
            }
          `;
          const existingAddress = (await client.request(addressLookup, {
            userId,
            address1: address.address1,
            postalCode: address.postalCode,
          })) as { addresses: Array<{ id: string }> };

          if (existingAddress.addresses[0]) {
            addressIds[address.key] = existingAddress.addresses[0].id;
          } else {
            const createAddress = gql`
              mutation CreateAddress($data: AddressCreateInput!) {
                createAddress(data: $data) {
                  id
                }
              }
            `;
            const result = (await client.request(createAddress, {
              data: {
                firstName: address.firstName,
                lastName: address.lastName,
                address1: address.address1,
                address2: address.address2,
                city: address.city,
                province: address.province,
                postalCode: address.postalCode,
                phone: address.phone,
                user: { connect: { id: userId } },
              },
            })) as { createAddress: { id: string } };
            addressIds[address.key] = result.createAddress.id;
          }
        }

        if (customer.substitutionPreference) {
          const prefLookup = gql`
            query FindSubstitutionPreference($userId: ID!) {
              substitutionPreferences(where: { user: { id: { equals: $userId } } }, take: 1) {
                id
              }
            }
          `;
          const existingPref = (await client.request(prefLookup, { userId })) as {
            substitutionPreferences: Array<{ id: string }>;
          };

          if (!existingPref.substitutionPreferences[0]) {
            const mutation = gql`
              mutation CreateSubstitutionPreference($data: SubstitutionPreferenceCreateInput!) {
                createSubstitutionPreference(data: $data) {
                  id
                }
              }
            `;
            await client.request(mutation, {
              data: {
                user: { connect: { id: userId } },
                allowSubstitutions: customer.substitutionPreference.allowSubstitutions,
                preferSimilarBrand: customer.substitutionPreference.preferSimilarBrand,
                preferSimilarSize: customer.substitutionPreference.preferSimilarSize,
                contactBeforeSubstitute: customer.substitutionPreference.contactBeforeSubstitute,
              },
            });
          }
        }

        for (const list of customer.shoppingLists || []) {
          const listLookup = gql`
            query FindShoppingList($userId: ID!, $name: String!) {
              shoppingLists(
                where: { user: { id: { equals: $userId } }, name: { equals: $name } }
                take: 1
              ) {
                id
              }
            }
          `;
          const existingList = (await client.request(listLookup, {
            userId,
            name: list.name,
          })) as { shoppingLists: Array<{ id: string }> };

          let listId = existingList.shoppingLists[0]?.id;
          if (!listId) {
            const mutation = gql`
              mutation CreateShoppingList($data: ShoppingListCreateInput!) {
                createShoppingList(data: $data) {
                  id
                }
              }
            `;
            const result = (await client.request(mutation, {
              data: {
                name: list.name,
                isDefault: list.isDefault,
                user: { connect: { id: userId } },
              },
            })) as { createShoppingList: { id: string } };
            listId = result.createShoppingList.id;
          }

          for (const item of list.items || []) {
            const itemLookup = gql`
              query FindShoppingListItem($listId: ID!, $product: String!) {
                shoppingListItems(
                  where: { list: { id: { equals: $listId } }, product: { equals: $product } }
                  take: 1
                ) {
                  id
                }
              }
            `;
            const existingItem = (await client.request(itemLookup, {
              listId,
              product: item.product,
            })) as { shoppingListItems: Array<{ id: string }> };

            if (!existingItem.shoppingListItems[0]) {
              const mutation = gql`
                mutation CreateShoppingListItem($data: ShoppingListItemCreateInput!) {
                  createShoppingListItem(data: $data) {
                    id
                  }
                }
              `;
              await client.request(mutation, {
                data: {
                  list: { connect: { id: listId } },
                  product: item.product,
                  quantity: item.quantity,
                  unit: item.unit,
                  checked: item.checked,
                  notes: item.notes,
                },
              });
            }
          }
        }

        for (const subscription of customer.subscriptions || []) {
          const subscriptionLookup = gql`
            query FindSubscription($userId: ID!, $product: String!) {
              subscriptions(
                where: { user: { id: { equals: $userId } }, product: { equals: $product } }
                take: 1
              ) {
                id
              }
            }
          `;
          const existingSubscription = (await client.request(subscriptionLookup, {
            userId,
            product: subscription.product,
          })) as { subscriptions: Array<{ id: string }> };

          if (!existingSubscription.subscriptions[0]) {
            const mutation = gql`
              mutation CreateSubscription($data: SubscriptionCreateInput!) {
                createSubscription(data: $data) {
                  id
                }
              }
            `;
            await client.request(mutation, {
              data: {
                user: { connect: { id: userId } },
                product: subscription.product,
                quantity: subscription.quantity,
                frequency: subscription.frequency,
                nextDeliveryDate: relativeDate(subscription.nextDeliveryOffsetDays || 7, 9),
                discount: subscription.discount,
                isActive: subscription.isActive,
              },
            });
          }
        }

        createdUsers[customer.email] = { id: userId!, addressIds };
        setItemCompleted('customers', itemName);
      } catch (error) {
        setItemError('customers', itemName, formatError(error));
      }
    }

    return createdUsers;
  };

  const seedOrders = async (
    client: GraphQLClient,
    orders: any[],
    customers: Record<string, { id: string; addressIds: Record<string, string> }>,
    products: ProductMap
  ) => {
    setProgress('Creating sample orders...');

    for (const order of orders) {
      const label = `Order #${order.displayId}`;
      setItemLoading('orders', label);

      try {
        const lookup = gql`
          query FindOrder($displayId: Int!) {
            orders(where: { displayId: { equals: $displayId } }, take: 1) {
              id
            }
          }
        `;
        const existing = (await client.request(lookup, { displayId: order.displayId })) as {
          orders: Array<{ id: string }>;
        };

        let orderId = existing.orders[0]?.id;

        if (!orderId) {
          const customer = customers[order.customerEmail];
          const deliveryMeta = timeWindowHours[order.deliveryTimeWindow] || { hour: 10 };
          const mutation = gql`
            mutation CreateOrder($data: OrderCreateInput!) {
              createOrder(data: $data) {
                id
              }
            }
          `;
          const result = (await client.request(mutation, {
            data: {
              displayId: order.displayId,
              email: order.email,
              status: order.status,
              taxRate: order.taxRate,
              deliveryDate: relativeDate(order.deliveryDayOffset || 0, deliveryMeta.hour, deliveryMeta.minute || 0),
              deliveryTimeWindow: order.deliveryTimeWindow,
              deliveryInstructions: order.deliveryInstructions,
              substitutionPreference: order.substitutionPreference,
              user: customer ? { connect: { id: customer.id } } : undefined,
              shippingAddress:
                customer?.addressIds?.[order.shippingAddressKey]
                  ? { connect: { id: customer.addressIds[order.shippingAddressKey] } }
                  : undefined,
            },
          })) as { createOrder: { id: string } };
          orderId = result.createOrder.id;
        }

        for (const lineItem of order.lineItems || []) {
          const product = products[lineItem.productHandle];
          const title = product?.title || lineItem.productHandle;
          const lineLookup = gql`
            query FindOrderLineItem($orderId: ID!, $title: String!) {
              orderLineItems(
                where: { order: { id: { equals: $orderId } }, title: { equals: $title } }
                take: 1
              ) {
                id
              }
            }
          `;
          const existingLine = (await client.request(lineLookup, {
            orderId,
            title,
          })) as { orderLineItems: Array<{ id: string }> };

          if (!existingLine.orderLineItems[0]) {
            const mutation = gql`
              mutation CreateOrderLineItem($data: OrderLineItemCreateInput!) {
                createOrderLineItem(data: $data) {
                  id
                }
              }
            `;
            await client.request(mutation, {
              data: {
                title,
                sku: product?.sku,
                quantity: lineItem.quantity,
                unitPrice: product?.price || 0,
                thumbnail: product?.imageUrl,
                order: { connect: { id: orderId } },
                product: product ? { connect: { id: product.id } } : undefined,
              },
            });
          }
        }

        setItemCompleted('orders', label);
      } catch (error) {
        setItemError('orders', label, formatError(error));
      }
    }
  };

  return { runOnboarding };
}
