import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GraphPayload } from '@nexusgraph/shared';
import { MapPin, Phone, Info } from 'lucide-react';

interface PhoneMapPanelProps {
  graphData: GraphPayload;
}

interface GeoPoint {
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
}

const phoneMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#10b981;border:2px solid #064e3b;box-shadow:0 0 12px rgba(16,185,129,0.7);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1fae5" stroke-width="2.4"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitBounds({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length === 1) {
      const p = points[0];
      const isCity = p.precision === 'CITY' || p.precision === 'CITY_LEVEL';
      map.setView([p.lat, p.lng], isCity ? 12 : 5);
    } else if (points.length > 1) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [40, 40], maxZoom: 12 },
      );
    }
  }, [map, points]);
  return null;
}

export function PhoneMapPanel({ graphData }: PhoneMapPanelProps) {
  const geoPoints = useMemo<GeoPoint[]>(() => {
    const nodes = graphData?.nodes || [];

    const carrierByPhone = new Map<string, string>();
    for (const n of nodes) {
      if (n.data?.entityType === 'PHONE') {
        const meta = (n.data?.metadata || {}) as Record<string, any>;
        if (meta.e164 && meta.carrier) carrierByPhone.set(String(meta.e164), String(meta.carrier));
      }
    }

    // LOCATION entities produced by phone tracking (metadata.sourcePhone present)
    const locations = nodes
      .filter((n) => n.data?.entityType === 'LOCATION')
      .map((n) => {
        const meta = (n.data?.metadata || {}) as Record<string, any>;
        const lat = Number(meta.lat ?? meta.latitude);
        const lng = Number(meta.lng ?? meta.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          nodeId: n.id,
          lat,
          lng,
          precision: String(meta.precision || 'COUNTRY'),
          countryName: meta.countryName,
          countryIso: meta.countryIso,
          sourcePhone: meta.sourcePhone,
          carrier: carrierByPhone.get(String(meta.sourcePhone || '')),
          confidence: n.data?.confidence ?? 0,
          label: n.data?.label || n.id,
        } as GeoPoint;
      })
      .filter((p): p is GeoPoint => p !== null);

    // PHONE entities carrying direct coordinates in metadata
    for (const n of nodes) {
      if (n.data?.entityType !== 'PHONE') continue;
      const meta = (n.data?.metadata || {}) as Record<string, any>;
      const lat = Number(meta.lat ?? meta.latitude);
      const lng = Number(meta.lng ?? meta.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (locations.some((loc) => loc.nodeId === n.id)) continue;
      locations.push({
        nodeId: n.id,
        lat,
        lng,
        precision: String(meta.precision || 'COUNTRY'),
        countryName: meta.countryName,
        countryIso: meta.countryIso,
        carrier: meta.carrier ? String(meta.carrier) : undefined,
        confidence: n.data?.confidence ?? 0,
        label: n.data?.label || n.id,
      });
    }

    return locations;
  }, [graphData]);

  if (geoPoints.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-app">
        <div className="max-w-md text-center space-y-2 p-6">
          <MapPin className="w-10 h-10 text-primary mx-auto" />
          <h3 className="text-sm font-semibold text-text">No Geolocation Records</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Run discovery on a phone number with country code (e.g.{' '}
            <span className="font-mono text-text">+62213500555</span>) to plot its registered region on the map.
          </p>
        </div>
      </div>
    );
  }

  const initialCenter: [number, number] =
    geoPoints.length === 1
      ? [geoPoints[0].lat, geoPoints[0].lng]
      : [
          geoPoints.reduce((s, p) => s + p.lat, 0) / geoPoints.length,
          geoPoints.reduce((s, p) => s + p.lng, 0) / geoPoints.length,
        ];

  return (
    <div className="h-full relative bg-app">
      {/* Floating Precision Info Tag */}
      <div className="absolute top-3 right-3 z-[500] flex items-center gap-1.5 px-3 py-1.5 bg-surface/90 border border-border-subtle rounded-md shadow-sm backdrop-blur-sm">
        <Info className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <span className="text-[11px] text-text-secondary">
          Precision:{' '}
          <strong className="text-text font-medium">
            {[...new Set(geoPoints.map((p) => (p.precision.includes('CITY') ? 'City Area' : 'Country Centroid')))].join(', ')}
          </strong>
        </span>
      </div>

      <div className="h-full w-full">
        <MapContainer
          center={initialCenter}
          zoom={geoPoints.length === 1 && (geoPoints[0].precision.includes('CITY')) ? 12 : 5}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: '#0a0f1a' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={geoPoints} />
          {geoPoints.map((p) => {
            const isCity = p.precision.includes('CITY');
            return (
              <React.Fragment key={p.nodeId}>
                {/* Accuracy Radius */}
                <Circle
                  center={[p.lat, p.lng]}
                  radius={isCity ? 15000 : 500000}
                  pathOptions={{
                    color: isCity ? '#06b6d4' : '#f59e0b',
                    weight: 1,
                    fillColor: isCity ? '#06b6d4' : '#f59e0b',
                    fillOpacity: isCity ? 0.12 : 0.06,
                  }}
                />
                <Marker position={[p.lat, p.lng]} icon={phoneMarkerIcon}>
                  <Popup>
                    <div className="p-1 min-w-[200px] font-sans text-xs">
                      <div className="font-semibold text-sm text-slate-900 mb-1">
                        {p.sourcePhone || p.label}
                      </div>
                      {p.carrier && (
                        <div className="text-slate-600 text-xs mb-1">
                          Carrier: <span className="font-medium text-slate-800">{p.carrier}</span>
                        </div>
                      )}
                      <div className="text-slate-500 text-[11px] font-mono mb-2">
                        {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isCity
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isCity ? 'City Level' : 'Country Centroid'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {p.countryName || 'Verified'}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* Coordinate legend */}
        <div className="absolute bottom-4 left-4 z-[500] bg-surface/90 border border-border-subtle rounded-md p-3 max-w-xs shadow-md backdrop-blur-sm">
          <div className="text-[11px] font-semibold text-text mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span>Locations ({geoPoints.length})</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {geoPoints.map((p) => (
              <div key={p.nodeId} className="text-[11px] text-text-muted leading-tight">
                <span className="text-text font-medium">{p.sourcePhone || p.label}</span>
                {p.carrier ? <span> · {p.carrier}</span> : null}
                <div className="text-[10px] font-mono text-text-muted mt-0.5">
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)} ({p.precision.includes('CITY') ? 'City' : 'Country'})
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
