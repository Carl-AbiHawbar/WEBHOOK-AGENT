/** A single business as returned by Google Places, narrowed to the fields we ask for. */
export interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  /** Absent when the business has no website on file. This absence IS the lead signal. */
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
}

export interface PlacesSearchResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
}

/** A website-less business, flattened and scored for outreach. */
export interface Lead {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  category: string | null;
  mapsUrl: string | null;
  /** 0-100. Higher means a more established business with more to gain from a site. */
  score: number;
}

export interface SearchOutcome {
  leads: Lead[];
  /** Every business the search returned, before the no-website filter. */
  totalFound: number;
  /** How many of those already had a website. */
  withWebsite: number;
  /** Places API requests actually issued, for cost tracking. */
  requestsUsed: number;
  fromCache: boolean;
}
