"use client";

import { useEffect } from 'react';
import { joinRide, leaveRide, onMessage, onRideStatusChanged } from '@/lib/rideSocket';

export default function PassengerRideSockets({ rideIds }: { rideIds: string[] }) {
  useEffect(() => {
    if (!rideIds || rideIds.length === 0) return;

    for (const id of rideIds) {
      joinRide(id, { role: 'PASSENGER' });
    }

    const offMsg = onMessage((m) => {
      console.log('Socket message', m);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('New message', { body: String(m?.text ?? m) });
      }
    });

    const offRideStatus = onRideStatusChanged((payload) => {
      if (!payload?.rideId || !rideIds.includes(String(payload.rideId))) return;
      if (payload.status === 'ACCEPTED') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Ride accepted', { body: 'Your driver has accepted the ride request.' });
        }
      }
      if (payload.status === 'DECLINED') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Ride declined', { body: 'Your driver could not take the ride request.' });
        }
      }
      if (payload.status === 'ARRIVED') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Driver arrived', { body: payload?.message ?? 'Your driver has arrived at the pickup point.' });
        }
      }
    });

    return () => {
      offMsg();
      offRideStatus();
      for (const id of rideIds) leaveRide(id);
    };
  }, [rideIds]);

  return null;
}
