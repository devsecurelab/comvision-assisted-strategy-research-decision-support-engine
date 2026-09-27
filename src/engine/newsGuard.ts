// News Guard Fail-Safe Architecture
// Monitors High-Impact (Red Folder) Macroeconomic Events
// Restriction Window: [T_news - 30 minutes, T_news + 30 minutes]

import { NewsEvent, NewsWindowState } from './types';

export class NewsGuardService {
  private events: NewsEvent[] = [];
  private sourceOnline: boolean = true;
  private lastCheckedTimestamp: string = new Date().toISOString();

  constructor() {
    this.seedDefaultEvents();
  }

  private seedDefaultEvents() {
    const now = Date.now();
    // Pre-seed some scheduled events (e.g., upcoming or recent)
    this.events = [
      {
        id: 'news-usd-nfp',
        title: 'Non-Farm Employment Change (NFP)',
        currency: 'USD',
        impact: 'HIGH',
        timestamp: new Date(now + 120 * 60 * 1000).toISOString(), // 2 hours in future (CLEAR)
        forecast: '175K',
        previous: '182K',
      },
      {
        id: 'news-eur-cpi',
        title: 'Core CPI Flash Estimate y/y',
        currency: 'EUR',
        impact: 'HIGH',
        timestamp: new Date(now - 180 * 60 * 1000).toISOString(), // 3 hours ago (CLEAR)
        forecast: '2.8%',
        previous: '2.9%',
      },
      {
        id: 'news-usd-fomc',
        title: 'FOMC Meeting Statement & Rate Decision',
        currency: 'USD',
        impact: 'HIGH',
        timestamp: new Date(now + 360 * 60 * 1000).toISOString(), // 6 hours in future
        forecast: '5.25%',
        previous: '5.25%',
      },
    ];
  }

  public getEvents(): NewsEvent[] {
    return this.events;
  }

  public isSourceOnline(): boolean {
    return this.sourceOnline;
  }

  public isOnline(): boolean {
    return this.sourceOnline;
  }

  public setSourceStatus(online: boolean) {
    this.sourceOnline = online;
    this.lastCheckedTimestamp = new Date().toISOString();
  }

  public addEvent(event: NewsEvent) {
    this.events.push(event);
  }

  public triggerSimulatedRedFolderEvent(minutesFromNow = 10, title = 'Simulated US Flash PMI') {
    const time = new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
    this.events.unshift({
      id: `sim-${Date.now()}`,
      title,
      currency: 'USD',
      impact: 'HIGH',
      timestamp: time,
      forecast: '51.2',
      previous: '50.8',
    });
  }

  public checkNewsWindow(currentTimestamp: string = new Date().toISOString()): {
    state: NewsWindowState;
    activeEvent?: NewsEvent;
    sourceOnline: boolean;
    lastChecked: string;
    countdownMinutes?: number;
  } {
    this.lastCheckedTimestamp = new Date().toISOString();
    if (!this.sourceOnline) {
      return {
        state: 'NEWS_DATA_UNAVAILABLE',
        sourceOnline: false,
        lastChecked: this.lastCheckedTimestamp,
      };
    }

    const currentTime = new Date(currentTimestamp).getTime();
    const restrictionMs = 30 * 60 * 1000; // 30 minutes

    for (const evt of this.events) {
      if (evt.impact === 'HIGH') {
        const evtTime = new Date(evt.timestamp).getTime();
        const diff = Math.abs(currentTime - evtTime);
        if (diff <= restrictionMs) {
          const remainingMinutes = Math.ceil((restrictionMs - (currentTime - evtTime)) / (60 * 1000));
          return {
            state: 'ACTIVE',
            activeEvent: evt,
            sourceOnline: true,
            lastChecked: this.lastCheckedTimestamp,
            countdownMinutes: remainingMinutes,
          };
        }
      }
    }

    return {
      state: 'CLEAR',
      sourceOnline: true,
      lastChecked: this.lastCheckedTimestamp,
    };
  }
}

export const newsGuard = new NewsGuardService();
