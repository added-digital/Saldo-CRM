"use client"

import * as React from "react"
import Link from "next/link"
import { Mail, Phone, Search, User, Users } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Customer, CustomerContact } from "@/types/database"
import { EmptyState } from "@/components/app/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useUser } from "@/hooks/use-user"

type ContactWithCustomers = CustomerContact & {
  customers: Pick<Customer, "id" | "name" | "fortnox_customer_number">[]
}

export default function ContactsPage() {
  const { isAdmin } = useUser()
  const [contacts, setContacts] = React.useState<ContactWithCustomers[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    async function fetchContacts() {
      const supabase = createClient()
      const { data: contactRows } = await supabase
        .from("customer_contacts")
        .select("*")
        .order("name")

      const contactsData = (contactRows ?? []) as unknown as CustomerContact[]
      const contactIds = contactsData.map((contact) => contact.id)

      let customerMap = new Map<string, Pick<Customer, "id" | "name" | "fortnox_customer_number">[]>()

      if (contactIds.length > 0) {
        const { data: linkRows } = await supabase
          .from("customer_contact_links")
          .select("contact_id, customer:customers(id, name, fortnox_customer_number)")
          .in("contact_id", contactIds)

        for (const row of (linkRows ?? []) as unknown as Array<{
          contact_id: string
          customer: Pick<Customer, "id" | "name" | "fortnox_customer_number"> | null
        }>) {
          if (!row.customer) continue
          const existing = customerMap.get(row.contact_id) ?? []
          existing.push(row.customer)
          customerMap.set(row.contact_id, existing)
        }
      }

      setContacts(
        contactsData.map((contact) => ({
          ...contact,
          customers: customerMap.get(contact.id) ?? [],
        }))
      )
      setLoading(false)
    }

    fetchContacts()
  }, [])

  const filteredContacts = React.useMemo(() => {
    if (!search) return contacts
    const query = search.toLowerCase()
    return contacts.filter((contact) => {
      const customerNames = contact.customers.map((customer) => customer.name.toLowerCase()).join(" ")
      return [contact.name, contact.email ?? "", contact.role ?? "", customerNames]
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [contacts, search])

  if (!isAdmin) {
    return <div className="h-48 animate-pulse rounded-lg border bg-muted" />
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search contacts or customers..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts"
          description="Contacts linked to customers will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start gap-3 text-base">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="truncate">{contact.name}</div>
                    {contact.role && (
                      <p className="text-sm font-normal text-muted-foreground">
                        {contact.role}
                      </p>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Mail className="size-4" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Phone className="size-4" />
                      <span>{contact.phone}</span>
                    </a>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Related Customers
                  </p>
                  {contact.customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No customer relations</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {contact.customers.map((customer) => (
                        <Link key={customer.id} href={`/customers/${customer.id}`}>
                          <Badge variant="outline" className="cursor-pointer font-normal hover:bg-muted">
                            {customer.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
