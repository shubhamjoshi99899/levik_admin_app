"use client";

import { ArrowLeft, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RelatedScans } from "@/components/scans/scans-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ProductThumb } from "@/components/shared/product-thumb";
import { QueryBoundary } from "@/components/shared/query-states";
import { DetailGrid, SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { $api, api, call, refreshAfterMutation } from "@/lib/api/client";
import { API_URL, getAccessToken, refreshAccessToken } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import type { ProductDto } from "@/lib/api/types";
import { formatDateTime, formatINR, formatNumber } from "@/lib/utils/format";
import { runAction } from "@/lib/utils/run-action";
import { LabelBatches } from "./label-batches";
import { ProductFormDialog } from "./product-form-dialog";

export function ProductDetail({ id }: { id: string }) {
  const query = $api.useQuery("get", "/api/v1/admin/products/{id}", { params: { path: { id } } });
  return (
    <QueryBoundary query={query} entity="Product" backHref="/products" backLabel="Back to catalogue">
      {(product) => <ProductPage product={product} />}
    </QueryBoundary>
  );
}

async function deleteProduct(id: string): Promise<void> {
  let token = getAccessToken() ?? (await refreshAccessToken());
  const send = (t: string | null) =>
    fetch(`${API_URL}/api/v1/admin/products/${id}`, {
      method: "DELETE",
      headers: t ? { authorization: `Bearer ${t}` } : {},
    });
  let res = await send(token);
  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await send(token);
  }
  if (!res.ok) throw await ApiError.fromResponse(res);
}

function ProductPage({ product }: { product: ProductDto }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: stockPage } = $api.useQuery("get", "/api/v1/admin/inventory", { params: { query: { productId: product.id, pageSize: 100 } } });
  const stock = stockPage?.items ?? [];

  return (
    <div>
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Product Catalogue
      </Link>
      <PageHeader
        title={product.name}
        description={`${product.category} · Model ${product.modelCode} · ${product.sku}`}
        eyebrow={<StatusBadge status={product.isActive ? "Active" : "Inactive"} />}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant={product.isActive ? "destructive" : "default"} onClick={() => setToggleOpen(true)}>
              {product.isActive ? <PowerOff /> : <Power />} {product.isActive ? "Deactivate" : "Activate"}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <ProductThumb src={product.imageUrl} alt={product.name} className="aspect-square w-full rounded-xl border border-border" sizes="380px" />
        <div className="space-y-6">
          <SectionCard title="Product information">
            <p className="mb-5 text-sm text-muted-foreground">{product.description}</p>
            <DetailGrid
              items={[
                { label: "Model code", value: <span className="font-mono">{product.modelCode}</span> },
                { label: "Category", value: product.category },
                { label: "Dimensions", value: product.dimensions ?? "Not published in catalogue" },
                { label: "Features", value: product.features.length ? product.features.join(" · ") : "—" },
                { label: "SKU", value: <span className="font-mono">{product.sku}</span> },
                { label: "Barcode reference", value: <span className="font-mono">{product.barcode}</span> },
                { label: "MRP", value: formatINR(product.mrp) },
                { label: "Reward eligibility", value: product.rewardEligible ? `${formatNumber(product.plumberPoints)} pts per approved scan` : "Not reward-eligible" },
                { label: "Last updated", value: formatDateTime(product.updatedAt) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Retailer-reported stock" description="Inventory reported by retailers in the app" bodyClassName="p-0">
            {stock.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No retailer has reported stock for this model.</p>
            ) : (
              <ul className="divide-y divide-border">
                {stock.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <Link href={`/retailers/${s.retailerId}`} className="hover:underline">
                      {s.retailerName}
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{s.quantity} units</span>
                      <StatusBadge status={s.stockStatus} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
      <div className="mt-6">
        <LabelBatches product={product} />
      </div>
      <SectionCard title="Scans of this model" className="mt-6" bodyClassName="p-0">
        <RelatedScans filter={{ productId: product.id }} />
      </SectionCard>
      <ProductFormDialog product={product} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete product?"
        description="This permanently removes the product from the catalogue. Existing scan and invoice records are unaffected, but the product will no longer appear anywhere in the portal."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const result = await runAction(
            () => deleteProduct(product.id),
            "Product deleted",
          );
          if (result.ok) {
            void refreshAfterMutation();
            router.push("/products");
          }
          return result.ok ? undefined : false;
        }}
      />
      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={product.isActive ? "Deactivate product?" : "Activate product?"}
        description={
          product.isActive
            ? "Inactive products stop earning scan points and invoice incentives. Existing approved transactions are unaffected."
            : "The product becomes visible and eligible for rewards again."
        }
        confirmLabel={product.isActive ? "Deactivate" : "Activate"}
        destructive={product.isActive}
        onConfirm={() =>
          runAction(
            () => call(api.PATCH("/api/v1/admin/products/{id}/status", { params: { path: { id: product.id } }, body: { isActive: !product.isActive } })),
            product.isActive ? "Product deactivated" : "Product activated",
          )
        }
      />
    </div>
  );
}
