# Inactive Member Notification Feature Documentation

## Overview

The Inactive Member Notification Feature automatically detects gym members who haven't been active for a configurable period of time and sends them personalized reminder emails to encourage re-engagement.

## Key Components

### Database Models

1. **Member Model Updates**:
   - Added `lastVisit` field to track the member's last activity
   - Added `lastNotificationSent` field to prevent sending too many notifications

2. **GymSettings Model**:
   - Stores admin-configurable settings for the feature
   - Controls whether the feature is enabled (`smartInactivityAlerts`)
   - Configurable threshold for inactivity days
   - Configurable cooldown period between notifications
   - Customizable message template

### Frontend Components

1. **Settings Page**:
   - User interface for gym admins to configure inactivity alerts
   - Toggle to enable/disable the feature
   - Input fields for threshold days, cooldown period, and custom message

2. **Member Details Page**:
   - Added display of last activity time for each member
   - Color-coded indicators based on recency of activity

### Backend Components

1. **Cron Job**:
   - Scheduled daily check for inactive members
   - Filters members by inactivity threshold and notification cooldown
   - Sends personalized emails to inactive members

2. **Email Service**:
   - Dedicated function for sending inactivity notifications
   - Customizable email templates with personalization

3. **Activity Tracking**:
   - Updated controllers to track member activity when:
     - Checking in at the gym (attendance)
     - Logging into their dashboard

## How It Works

1. **Configuration**:
   - Gym admin enables the feature through the Settings page
   - Admin configures threshold days, cooldown period, and custom message

2. **Activity Tracking**:
   - Every time a member checks in at the gym or logs into their dashboard, their `lastVisit` timestamp is updated

3. **Daily Check**:
   - A cron job runs daily to find members who:
     - Have not visited the gym in X days (where X is the configured threshold)
     - Have not received a notification in Y days (where Y is the configured cooldown)

4. **Notification**:
   - System sends personalized email reminders to inactive members
   - Updates the `lastNotificationSent` timestamp to prevent duplicate notifications

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `smartInactivityAlerts` | Enable/disable the feature | `false` |
| `inactivityThresholdDays` | Days without activity before sending notification | `2` |
| `notificationCooldownDays` | Minimum days between notifications | `3` |
| `customInactivityMessage` | Customizable message template | "Hey {{name}}! We've missed you at the gym. Let's get back on track 💪" |

## Testing

The feature can be manually tested using the command:

```
npm run test:inactivity
```

This will run the inactivity check once without waiting for the scheduled cron job.

## Implementation Notes

- The feature respects member privacy by only sending notifications to members with active status
- Notifications are only sent if the gym admin has enabled the feature
- The implementation includes proper error handling to ensure reliable operation 