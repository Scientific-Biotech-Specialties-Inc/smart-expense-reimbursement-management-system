<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $notification->title }}</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F7FA; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#1E293B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F7FA; padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E2E8F0; box-shadow:0 4px 12px rgba(15, 23, 42, 0.06);">
                    <!-- Branded SBSI Header -->
                    <tr>
                        <td style="background-color:#1B365D; padding:24px 32px;">
                            <div style="font-size:11px; font-weight:700; letter-spacing:1.5px; color:#93C5FD; text-transform:uppercase; margin-bottom:4px;">
                                SBSI • SMART EXPENSE &amp; REIMBURSEMENT MANAGEMENT SYSTEM
                            </div>
                            <div style="font-size:20px; font-weight:700; color:#FFFFFF; line-height:1.3;">
                                {{ $notification->title }}
                            </div>
                        </td>
                    </tr>

                    <!-- Greeting & Primary Message -->
                    <tr>
                        <td style="padding:28px 32px 16px 32px;">
                            <p style="margin:0 0 12px 0; font-size:15px; color:#334155;">
                                Hello <strong>{{ $recipient->name ?? 'User' }}</strong>,
                            </p>
                            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#1E293B;">
                                {{ $notification->message }}
                            </p>

                            <!-- Structured Record Details Card -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-left:4px solid #2E85D8; border-radius:8px; padding:16px 20px; margin-bottom:24px;">
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B; width:150px;">Module:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">{{ $notification->module }}</td>
                                </tr>
                                @if($notification->record_id)
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Record Reference:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">#{{ $notification->record_id }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['employee_name']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Employee:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">{{ $details['employee_name'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['status']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Status:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#1B365D;">{{ $details['status'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['amount']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Amount:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#0F172A;">{{ $details['amount'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['days_overdue']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Days Overdue:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#DC2626;">{{ $details['days_overdue'] }} {{ (int)$details['days_overdue'] === 1 ? 'day' : 'days' }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['penalty_formatted']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Accrued Penalty:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#DC2626;">{{ $details['penalty_formatted'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['comment']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B; vertical-align:top;">Note / Reason:</td>
                                    <td style="padding:4px 0; font-size:13px; font-style:italic; color:#334155;">"{{ $details['comment'] }}"</td>
                                </tr>
                                @endif
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Date:</td>
                                    <td style="padding:4px 0; font-size:13px; color:#0F172A;">{{ $formattedDate }}</td>
                                </tr>
                            </table>

                            <!-- Primary CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">
                                <tr>
                                    <td align="center" style="border-radius:8px; background-color:#2E85D8;">
                                        <a href="{{ $recordUrl }}" target="_blank" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:8px;">
                                            View Record in SERMS
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer with Notification Settings Link (G2-074 Task 4) -->
                    <tr>
                        <td style="background-color:#F8FAFC; border-top:1px solid #E2E8F0; padding:18px 32px; font-size:12px; color:#64748B; line-height:1.5;">
                            <p style="margin:0 0 6px 0;">
                                You received this email because notifications are enabled for your SBSI SERMS account.
                            </p>
                            <p style="margin:0;">
                                <a href="{{ $settingsUrl }}" target="_blank" style="color:#2E85D8; font-weight:600; text-decoration:underline;">
                                    Manage Notification Settings
                                </a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
