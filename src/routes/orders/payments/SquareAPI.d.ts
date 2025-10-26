interface SquareMoney {
    amount: number;
    currency: string;
}

interface SquareOrder {
    id: string;
    location_id: string;
    source: {
        name: string;
    };
    line_items: {
        uid: string;
        name: string;
        quantity: string;
        note: string;
        catalog_object_id: string;
        catalog_version: number;
        variation_name: string;
        item_type: string;
        base_price_money: SquareMoney;
        variation_total_price_money: SquareMoney;
        gross_sales_money: SquareMoney;
        total_tax_money: SquareMoney;
        total_discount_money: SquareMoney;
        total_money: SquareMoney;
        total_service_charge_money: SquareMoney;
    }[];
    fulfillments: {
        uid: string;
        type: string;
        state: string;
    }[];
    net_amounts: {
        total_money: SquareMoney;
        tax_money: SquareMoney;
        discount_money: SquareMoney;
        tip_money: SquareMoney;
        service_charge_money: SquareMoney;
    };
    created_at: string;
    updated_at: string;
    state: string;
    version: number;
    total_money: SquareMoney;
    total_tax_money: SquareMoney;
    total_discount_money: SquareMoney;
    total_tip_money: SquareMoney;
    total_service_charge_money: SquareMoney;
    net_amount_due_money: SquareMoney;
}

interface Response_BatchRetrieveCatalogObjects {
    objects: {
        type: string;
        id: string;
        updated_at: string;
        created_at: string;
        version: number;
        is_deleted: boolean;
        present_at_all_locations: boolean;
        item_variation_data: {
            item_id: string;
            name: string;
            sku: string;
            ordinal: number;
            pricing_type: string;
            price_money: SquareMoney;
            location_overrides: {
                location_id: string;
                track_inventory?: boolean;
                // other overrides?
            }[];
            track_inventory: boolean;
            sellable: boolean;
            stockable: boolean;
        };
    }[];
}

interface Response_BatchRetrieveCounts {
    counts: {
        catalog_object_id: string;
        catalog_object_type: string;
        state: string;
        location_id: string;
        quantity: string;
        calculated_at: string;
    }[];
}

interface Response_CreatePaymentLink {
    payment_link: {
        id: string;
        version: number;
        order_id: string;
        checkout_options: {
            redirect_url: string;
        };
        url: string;
        long_url: string;
        created_at: string;
    };
    related_resources: {
        orders: SquareOrder[];
    }
}

interface Response_ListCatalogObjects {
    objects: {
        type: string;
        id: string;
        updated_at: string;
        created_at: string;
        version: number;
        is_deleted: boolean;
        present_at_all_locations: boolean;
        item_data: {
            name: string;
            description: string;
            is_taxable: boolean;
            variations: {
                type: string;
                id: string;
                updated_at: string;
                created_at: string;
                version: number;
                is_deleted: boolean;
                present_at_all_locations: boolean;
                item_variation_data: {
                    item_id: string;
                    name: string;
                    sku: string;
                    ordinal: number;
                    pricing_type: string;
                    price_money: SquareMoney;
                    location_overrides: {
                        location_id: string;
                        track_inventory?: boolean;
                        // other overrides?
                    }[];
                    track_inventory: boolean;
                    sellable: boolean;
                    stockable: boolean;
                };
            }[];
            product_type: string;
            skip_modifier_screen: boolean;
            description_html: string;
            description_plaintext: string;
            is_archived: boolean;
        }[];
        product_type: string;
        skip_modifier_screen: boolean;
        description_html: string;
        description_plaintext: string;
        is_archived: boolean;
    }[];
}

export interface Responses {
    BatchRetrieveCatalogObjects: Response_BatchRetrieveCatalogObjects;
    BatchRetrieveCounts: Response_BatchRetrieveCounts;
    CreatePaymentLink: Response_CreatePaymentLink;
    ListCatalogObjects: Response_ListCatalogObjects;
}