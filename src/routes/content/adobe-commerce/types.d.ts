export interface Product {
    name: string;
    sku: string;
    addToCartAllowed: boolean;
    inStock: boolean | null;
    shortDescription?: string;
    metaDescription?: string;
    metaKeyword?: string;
    metaTitle?: string;
    description?: string;
    images: Image[];
    prices: Prices;
    attributes: Attribute[];
    options: ProductOption[];
    url?: string;
    urlKey?: string;
    externalId?: string;
    variants?: Variant[]; // variants exist on products in helix commerce but not on magento
    specialToDate?: string;
    rating?: Rating;
    links?: Link[];

    // Coming only from Catalog Service at the time of writing:
    lastModifiedAt?: string;

    // not handled currently:
    externalParentId?: string;
    variantSku?: string;
    optionUIDs?: string[];

    // internal use:
    attributeMap: Record<string, string>;
}

export interface Variant {
    sku: string;
    name: string;
    description?: string;
    url: string;
    inStock: boolean;
    images: Image[];
    prices: Pick<Prices, 'regular' | 'final'>;
    selections: string[];
    attributes: Attribute[];
    externalId: string;
    specialToDate?: string;
    gtin?: string;
    rating?: Rating;

    // internal use:
    attributeMap: Record<string, string>;
}

interface Rating {
    // number of ratings
    count?: number;
    // number of reviews
    reviews?: number;
    // rating value
    value: number | string;
    // range of ratings, highest
    best?: number | string;
    // range of ratings, lowest
    worst?: number | string;
}

interface Link {
    types: string[];
    sku: string;
    urlKey: string;
    prices: Prices;
}

interface Image {
    url: string;
    label: string;
    roles: string[];
}

interface Price {
    amount?: number;
    currency?: string;
    maximumAmount?: number;
    minimumAmount?: number;
    variant?: 'default' | 'strikethrough';
}

interface Prices {
    regular: Price;
    final: Price;
    visible: boolean;
}

export interface ProductOption {
    id: string;
    type: 'text' | 'image' | 'color' | 'dropdown';
    typename:
    | 'ProductViewOptionValueProduct'
    | 'ProductViewOptionValueSwatch'
    | 'ProductViewOptionValueConfiguration';
    label: string;
    required: boolean;
    multiple: boolean;
    items: OptionValue[];
}

interface OptionValue {
    id: string;
    label: string;
    inStock: boolean;
    value: string;
    selected: boolean;
    type: string;
    product?: {
        name: string;
        sku: string;
        prices?: Prices;
    };
}

interface Attribute {
    name: string;
    label: string;
    value: string;
}