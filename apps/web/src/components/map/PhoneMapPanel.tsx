import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GraphPayload } from '@nexusgraph/shared';
import { resolveAccurateLocation } from '@nexusgraph/shared';
import { useAppStore } from '../../stores/appStore';
import {
  MapPin,
  Building,
  Phone,
  Info,
  ExternalLink,
  Copy,
  Check,
  Compass,
  ChevronRight,
  Search,
} from 'lucide-react';

interface PhoneMapPanelProps {
  graphData: GraphPayload;
}

export interface GeoPoint {
  nodeId: string;
  lat: number;
  lng: number;
  precision: string;
  countryName?: string;
  countryIso?: string;
  sourcePhone?: string;
  carrier?: string;
  confidence: number;
  label: string;
  isCompanyGeo?: boolean;
  googleMapsUrl?: string;
  address?: string;
  detectionMethod?: string;
  corporateDomain?: string;
}

// Strict monochrome black-and-white markers (Anti-Slop / Dark Slate Minimalist)
const companyGeoMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:#0d0d0d;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.85);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

const companyGeoFocusedIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;background:#ffffff;border:2px solid #000000;box-shadow:0 4px 20px rgba(255,255,255,0.35);"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -21],
});

const phoneMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:#0d0d0d;border:2px solid #a3a3a3;box-shadow:0 4px 14px rgba(0,0,0,0.85);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

const phoneFocusedIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;background:#ffffff;border:2px solid #000000;box-shadow:0 4px 20px rgba(255,255,255,0.35);"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -21],
});

/** Parse fallback coordinates from Google Maps URLs */
function parseCoordinatesFromUrl(url?: string): { lat: number; lng: number } | null {
  if (!url) return null;
  // 1. Protobuf format: !2d<lng>!3d<lat>
  const protoMatch = url.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
  if (protoMatch) {
    const lng = parseFloat(protoMatch[1]);
    const lat = parseFloat(protoMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  // 2. @lat,lng format: @-6.2297,106.8295
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  // 3. Query param format: ?q=-6.2297,106.8295 or ?ll=... or ?center=...
  const qMatch = url.match(/[?&](?:query|q|center|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function formatPrecisionLabel(precision: string): string {
  if (precision === 'EXACT_COORDINATES') return 'GPS (Eksak)';
  if (precision === 'STREET_ADDRESS') return 'Alamat Jalan';
  if (precision === 'DISTRICT_LEVEL') return 'Kecamatan / Area';
  if (precision === 'VENUE_LEVEL') return 'Gedung / Tempat';
  if (precision.includes('CITY')) return 'Tingkat Kota';
  if (precision === 'UNRESOLVED') return 'Belum Terpetakan';
  return 'Centroid Wilayah';
}

function getPrecisionRadius(precision: string, isCompany: boolean): number {
  if (precision === 'EXACT_COORDINATES') return 100;
  if (precision === 'STREET_ADDRESS') return 300;
  if (precision === 'VENUE_LEVEL') return 500;
  if (precision === 'DISTRICT_LEVEL') return 3000;
  if (precision.includes('CITY')) return 15000;
  return isCompany ? 5000 : 500000;
}

/** Map controller handling initial bounds, reactive zoom to focused node, and auto-resize invalidation */
function MapController({
  points,
  focusedPoint,
  sidebarCollapsed,
}: {
  points: GeoPoint[];
  focusedPoint?: GeoPoint | null;
  sidebarCollapsed: boolean;
}) {
  const map = useMap();

  // 1. Invalidate size on mount, container resize (drawers/console/sidebars), and window resize
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const triggerInvalidate = () => {
      map.invalidateSize({ debounceMoveend: true });
    };

    // Trigger immediately and staggered to catch flex transitions & initial layout calculation
    triggerInvalidate();
    const animId = requestAnimationFrame(triggerInvalidate);
    const t1 = setTimeout(triggerInvalidate, 80);
    const t2 = setTimeout(triggerInvalidate, 200);
    const t3 = setTimeout(triggerInvalidate, 450);
    const t4 = setTimeout(triggerInvalidate, 800);

    // Watch for size changes using ResizeObserver on map container and its parent element
    let rafTimer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafTimer !== null) cancelAnimationFrame(rafTimer);
      rafTimer = requestAnimationFrame(() => {
        triggerInvalidate();
      });
    });

    ro.observe(container);
    if (container.parentElement) {
      ro.observe(container.parentElement);
    }

    window.addEventListener('resize', triggerInvalidate);

    return () => {
      cancelAnimationFrame(animId);
      if (rafTimer !== null) cancelAnimationFrame(rafTimer);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      ro.disconnect();
      window.removeEventListener('resize', triggerInvalidate);
    };
  }, [map]);

  // 2. Invalidate size when sidebar collapse animation runs (transition-all duration-200)
  useEffect(() => {
    const triggerInvalidate = () => {
      map.invalidateSize({ debounceMoveend: true });
    };

    triggerInvalidate();
    const t1 = setTimeout(triggerInvalidate, 80);
    const t2 = setTimeout(triggerInvalidate, 220);
    const t3 = setTimeout(triggerInvalidate, 350);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map, sidebarCollapsed]);

  // 3. Center and zoom bounds when points or focused node change
  useEffect(() => {
    map.invalidateSize({ debounceMoveend: true });

    if (focusedPoint) {
      map.flyTo([focusedPoint.lat, focusedPoint.lng], 16, {
        duration: 1.2,
      });
      return;
    }

    if (points.length === 1) {
      const p = points[0];
      const isExact = p.isCompanyGeo || p.precision.includes('CITY') || p.precision.includes('EXACT');
      map.setView([p.lat, p.lng], isExact ? 14 : 6);
    } else if (points.length > 1) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [50, 50], maxZoom: 14 },
      );
    }
  }, [map, points, focusedPoint]);

  return null;
}

export function PhoneMapPanel({ graphData }: PhoneMapPanelProps) {
  const focusedGeoNodeId = useAppStore((s) => s.focusedGeoNodeId);
  const setFocusedGeoNodeId = useAppStore((s) => s.setFocusedGeoNodeId);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);

  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'office' | 'carrier'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Extract and resolve all geo points from graph
  const geoPoints = useMemo<GeoPoint[]>(() => {
    const nodes = graphData?.nodes || [];

    const carrierByPhone = new Map<string, string>();
    for (const n of nodes) {
      if (n.data?.entityType === 'PHONE') {
        const meta = (n.data?.metadata || {}) as Record<string, any>;
        if (meta.e164 && meta.carrier) carrierByPhone.set(String(meta.e164), String(meta.carrier));
      }
    }

    const locations: GeoPoint[] = [];

    for (const n of nodes) {
      const meta = (n.data?.metadata || {}) as Record<string, any>;
      const isCompanyGeo = Boolean(
        meta.isCompanyGeo ||
        meta.googleMapsUrl ||
        meta.collector === 'company-geo' ||
        meta.discoveredBy === 'company-geo' ||
        (meta.source as any)?.collector === 'company-geo'
      );

      const rawLat = meta.lat ?? meta.latitude;
      const rawLng = meta.lng ?? meta.longitude;
      let lat = rawLat !== null && rawLat !== undefined && rawLat !== '' ? Number(rawLat) : NaN;
      let lng = rawLng !== null && rawLng !== undefined && rawLng !== '' ? Number(rawLng) : NaN;

      // Fallback coordinate extraction if missing
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const parsed = parseCoordinatesFromUrl(meta.googleMapsUrl);
        if (parsed) {
          lat = parsed.lat;
          lng = parsed.lng;
        }
      }

      // Dynamic real-world location resolution (Google Maps verified)
      // Corrects legacy Jakarta fallback centroids (-6.2088, 106.8456) when address explicitly belongs to Depok, Cimanggis, Jagakarsa, etc.
      const fullAddressText = String(
        meta.address || meta.fullAddress || n.data?.label || n.data?.title || ''
      );
      const corporateDomain = String(meta.companyDomain || meta.domain || meta.apex || '');
      const accurateResolution = resolveAccurateLocation(fullAddressText, corporateDomain, lat, lng);

      if (accurateResolution) {
        lat = accurateResolution.lat;
        lng = accurateResolution.lng;
      }

      // If valid coordinates found (reject NaN, null, Null Island (0,0), and out-of-bounds)
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
      ) {
        const rawPrecision = String(meta.precision || '');
        const precision =
          accurateResolution?.precision || rawPrecision || (isCompanyGeo ? 'STREET_ADDRESS' : 'COUNTRY');
        const googleMapsUrl =
          accurateResolution?.googleMapsUrl ||
          meta.googleMapsUrl ||
          `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

        locations.push({
          nodeId: n.id,
          lat,
          lng,
          precision,
          countryName: meta.countryName,
          countryIso: meta.countryIso,
          sourcePhone: meta.sourcePhone || (n.data?.entityType === 'PHONE' ? n.data.value : undefined),
          carrier: carrierByPhone.get(String(meta.sourcePhone || '')) || meta.carrier,
          confidence: n.data?.confidence ?? 0,
          label: n.data?.label || n.data?.title || n.data?.value || n.id,
          isCompanyGeo,
          googleMapsUrl,
          address: meta.address || meta.fullAddress || accurateResolution?.matchedName,
          detectionMethod: accurateResolution ? 'known_verified_location' : meta.detectionMethod,
          corporateDomain,
        });
      }
    }

    return locations;
  }, [graphData]);

  // Handle coordinate clipboard copying
  const handleCopyCoordinates = (e: React.MouseEvent, p: GeoPoint) => {
    e.stopPropagation();
    const text = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedNodeId(p.nodeId);
    setTimeout(() => setCopiedNodeId(null), 2000);
  };

  // Currently focused point
  const focusedPoint = useMemo(
    () => (focusedGeoNodeId ? geoPoints.find((p) => p.nodeId === focusedGeoNodeId) || null : null),
    [focusedGeoNodeId, geoPoints]
  );

  // Filtered points for list view
  const filteredPoints = useMemo(() => {
    return geoPoints.filter((p) => {
      if (activeFilter === 'office' && !p.isCompanyGeo) return false;
      if (activeFilter === 'carrier' && p.isCompanyGeo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const corpus = `${p.label} ${p.address || ''} ${p.carrier || ''} ${p.countryName || ''}`.toLowerCase();
        return corpus.includes(q);
      }
      return true;
    });
  }, [geoPoints, activeFilter, searchQuery]);

  if (geoPoints.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a] text-neutral-400 select-text">
        <div className="max-w-md text-center space-y-3 p-8 bg-[#121212] border border-[#222222] rounded-lg shadow-lg">
          <div className="w-12 h-12 rounded-lg bg-[#181818] border border-[#262626] flex items-center justify-center mx-auto text-white">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white font-sans">Belum Ada Titik Geo-Lokasi Terdeteksi</h3>
          <p className="text-xs text-neutral-400 leading-relaxed font-sans">
            Jalankan modul penemuan pada domain organisasi (seperti <span className="font-mono text-neutral-200">domain.company-geo-location</span>) atau nomor telepon internasional untuk memetakan kantor fisik & koordinat geografis di sini.
          </p>
        </div>
      </div>
    );
  }

  const initialCenter: [number, number] =
    focusedPoint
      ? [focusedPoint.lat, focusedPoint.lng]
      : geoPoints.length === 1
      ? [geoPoints[0].lat, geoPoints[0].lng]
      : [
          geoPoints.reduce((s, p) => s + p.lat, 0) / geoPoints.length,
          geoPoints.reduce((s, p) => s + p.lng, 0) / geoPoints.length,
        ];

  const officeCount = geoPoints.filter((p) => p.isCompanyGeo).length;
  const carrierCount = geoPoints.filter((p) => !p.isCompanyGeo).length;

  return (
    <div className="h-full relative bg-[#0a0a0a] flex overflow-hidden select-text">
      {/* Dark Leaflet Popup Global CSS Override & Tile Layer Safety */}
      <style>{`
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #111111 !important;
          color: #f5f5f5 !important;
          border: 1px solid #2e2e2e !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.85) !important;
          border-radius: 8px !important;
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #888888 !important;
          padding: 6px !important;
        }
        .leaflet-container a.leaflet-popup-close-button:hover {
          color: #ffffff !important;
        }
        /* Protect Leaflet tile images from Tailwind CSS img { max-width: 100% } constraints */
        .leaflet-container img {
          max-width: none !important;
        }
        .leaflet-tile-container img {
          max-width: none !important;
        }
        .leaflet-tile {
          visibility: inherit !important;
        }
      `}</style>

      {/* Interactive Geo-Locations Sidebar (Monochrome Dark) */}
      <div
        className={`h-full bg-[#0a0a0a] border-r border-[#222222] flex flex-col z-[500] transition-all duration-200 ${
          sidebarCollapsed ? 'w-12' : 'w-80 sm:w-96'
        } shrink-0`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-[#222222] flex items-center justify-between bg-[#111111]">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-white shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-white font-sans truncate">
                  Geo Intelligence Map
                </h4>
                <div className="text-[10px] text-neutral-400 font-mono">
                  {geoPoints.length} titik koordinat aktif
                </div>
              </div>
            </div>
          ) : (
            <div className="w-7 h-7 rounded bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-white mx-auto">
              <MapPin className="w-4 h-4" />
            </div>
          )}

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#1a1a1a] transition-colors cursor-pointer"
            title={sidebarCollapsed ? 'Buka daftar lokasi' : 'Ciutkan panel'}
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform duration-200 ${
                sidebarCollapsed ? 'rotate-0' : 'rotate-180'
              }`}
            />
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Filter Tabs & Search */}
            <div className="p-3 border-b border-[#222222] space-y-2 bg-[#0d0d0d]">
              {/* Category Segmented Control */}
              <div className="flex items-center p-0.5 bg-[#141414] border border-[#262626] rounded-md text-[11px] font-sans">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`flex-1 py-1 px-2 rounded font-medium transition-colors cursor-pointer ${
                    activeFilter === 'all'
                      ? 'bg-[#222222] text-white border border-[#333333]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Semua ({geoPoints.length})
                </button>
                <button
                  onClick={() => setActiveFilter('office')}
                  className={`flex-1 py-1 px-2 rounded font-medium transition-colors cursor-pointer ${
                    activeFilter === 'office'
                      ? 'bg-[#222222] text-white border border-[#333333]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Kantor ({officeCount})
                </button>
                <button
                  onClick={() => setActiveFilter('carrier')}
                  className={`flex-1 py-1 px-2 rounded font-medium transition-colors cursor-pointer ${
                    activeFilter === 'carrier'
                      ? 'bg-[#222222] text-white border border-[#333333]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Carrier ({carrierCount})
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama kantor, kota, alamat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#141414] border border-[#262626] rounded-md pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 font-sans"
                />
              </div>
            </div>

            {/* List of locations */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-[#0a0a0a]">
              {filteredPoints.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  Tidak ada lokasi yang cocok dengan filter
                </div>
              ) : (
                filteredPoints.map((p) => {
                  const isSelected = focusedGeoNodeId === p.nodeId;
                  const isOffice = Boolean(p.isCompanyGeo);

                  return (
                    <div
                      key={p.nodeId}
                      onClick={() => {
                        setFocusedGeoNodeId(p.nodeId);
                        setSelectedNodeId(p.nodeId);
                      }}
                      className={`p-2.5 rounded-md border text-xs cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? 'bg-[#181818] border-neutral-300 text-white shadow-sm'
                          : 'bg-[#111111] border-[#222222] hover:border-[#333333] hover:bg-[#161616]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isOffice ? (
                            <Building className="w-3.5 h-3.5 text-white shrink-0" />
                          ) : (
                            <Phone className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                          )}
                          <span className="font-semibold text-white truncate font-sans">
                            {p.label}
                          </span>
                        </div>
                        <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded shrink-0 bg-[#1f1f1f] text-neutral-300 border border-[#2e2e2e]">
                          {isOffice ? 'KANTOR' : 'CARRIER'}
                        </span>
                      </div>

                      {p.address && (
                        <p className="text-[11px] text-neutral-300 line-clamp-2 mt-1 leading-relaxed">
                          {p.address}
                        </p>
                      )}

                      {p.carrier && (
                        <div className="text-[10.5px] text-neutral-400 mt-1 font-sans">
                          Operator: <span className="text-white font-medium">{p.carrier}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#222222] text-[10.5px] font-mono text-neutral-400">
                        <span className="truncate">
                          {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleCopyCoordinates(e, p)}
                            className="p-1 hover:text-white rounded hover:bg-[#222222] transition-colors cursor-pointer"
                            title="Salin koordinat GPS"
                          >
                            {copiedNodeId === p.nodeId ? (
                              <Check className="w-3 h-3 text-white" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          {p.googleMapsUrl && (
                            <a
                              href={p.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 hover:text-white rounded hover:bg-[#222222] transition-colors cursor-pointer"
                              title="Buka di Google Maps eksternal"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Main Leaflet Map View */}
      <div className="flex-1 h-full relative min-w-0 overflow-hidden">
        {/* Floating Controls Bar */}
        <div className="absolute top-3 right-3 z-[500] flex items-center gap-2">
          {/* Quick Office Center Shortcut */}
          {officeCount > 0 && (
            <button
              onClick={() => {
                const firstOffice = geoPoints.find((p) => p.isCompanyGeo);
                if (firstOffice) {
                  setFocusedGeoNodeId(firstOffice.nodeId);
                  setSelectedNodeId(firstOffice.nodeId);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111111]/95 border border-[#2e2e2e] rounded-md text-xs text-neutral-200 hover:text-white hover:bg-[#1c1c1c] transition-colors shadow-sm backdrop-blur-sm cursor-pointer"
              title="Fokus ke titik kantor perusahaan"
            >
              <Building className="w-3.5 h-3.5 text-white" />
              <span>Fokus Kantor ({officeCount})</span>
            </button>
          )}

          {/* Precision Indicator Tag */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111111]/90 border border-[#262626] rounded-md shadow-sm backdrop-blur-sm">
            <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-[11px] text-neutral-300 font-sans">
              Precision:{' '}
              <strong className="text-white font-medium">
                {[...new Set(geoPoints.map((p) => formatPrecisionLabel(p.precision)))].join(', ')}
              </strong>
            </span>
          </div>
        </div>

        <MapContainer
          center={initialCenter}
          zoom={geoPoints.length === 1 && (geoPoints[0].precision.includes('CITY') || geoPoints[0].isCompanyGeo) ? 14 : 6}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: '#e5e7eb' }}
        >
          {/* Standard OpenStreetMap Tiles (Free, No API key required, Normal map colors) */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <MapController
            points={geoPoints}
            focusedPoint={focusedPoint}
            sidebarCollapsed={sidebarCollapsed}
          />

          {geoPoints.map((p) => {
            const isCompany = Boolean(p.isCompanyGeo);
            const isFocused = focusedGeoNodeId === p.nodeId;
            const radius = getPrecisionRadius(p.precision, isCompany);
            const circleColor = isFocused ? '#000000' : '#404040';
            const icon = isCompany
              ? isFocused
                ? companyGeoFocusedIcon
                : companyGeoMarkerIcon
              : isFocused
              ? phoneFocusedIcon
              : phoneMarkerIcon;

            return (
              <React.Fragment key={p.nodeId}>
                {/* Accuracy Radius Indicator */}
                <Circle
                  center={[p.lat, p.lng]}
                  radius={radius}
                  pathOptions={{
                    color: circleColor,
                    weight: isFocused ? 2 : 1,
                    fillColor: '#171717',
                    fillOpacity: isFocused ? 0.18 : 0.08,
                  }}
                />

                <Marker
                  position={[p.lat, p.lng]}
                  icon={icon}
                  eventHandlers={{
                    click: () => {
                      setFocusedGeoNodeId(p.nodeId);
                      setSelectedNodeId(p.nodeId);
                    },
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[220px] max-w-[300px] font-sans text-xs select-text text-neutral-200">
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-white mb-1.5 leading-snug">
                        {isCompany ? (
                          <Building className="w-4 h-4 text-white shrink-0" />
                        ) : (
                          <Phone className="w-4 h-4 text-neutral-300 shrink-0" />
                        )}
                        <span className="truncate">{p.label}</span>
                      </div>

                      {p.address && (
                        <div className="text-neutral-300 text-xs mb-2 leading-relaxed bg-[#161616] p-2 rounded border border-[#2a2a2a]">
                          <span className="font-semibold text-[10.5px] text-neutral-400 block mb-0.5">
                            Alamat Kantor:
                          </span>
                          {p.address}
                        </div>
                      )}

                      {p.carrier && (
                        <div className="text-neutral-400 text-xs mb-1.5">
                          Carrier: <span className="font-medium text-white">{p.carrier}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-neutral-300 text-[11px] font-mono mb-2 bg-[#161616] px-2 py-1 rounded border border-[#262626]">
                        <span>
                          {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                        </span>
                        <button
                          onClick={(e) => handleCopyCoordinates(e, p)}
                          className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          title="Salin koordinat"
                        >
                          {copiedNodeId === p.nodeId ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-[#262626]">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1e1e1e] text-neutral-300 border border-[#2e2e2e]">
                          {formatPrecisionLabel(p.precision)}
                        </span>

                        {p.googleMapsUrl && (
                          <a
                            href={p.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-300 hover:text-white hover:underline"
                          >
                            <span>Google Maps ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
