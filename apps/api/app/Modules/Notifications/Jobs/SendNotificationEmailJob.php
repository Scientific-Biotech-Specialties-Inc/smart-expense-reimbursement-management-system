<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\NotificationPreferenceService;
use App\Modules\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendNotificationEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /**
     * Backoff intervals in seconds before retrying a failed email delivery.
     *
     * @var array<int, int>
     */
    public array $backoff = [10, 30, 60];

    public function __construct(public int $emailLogId)
    {
    }

    public function handle(): void
    {
        $emailLog = EmailLog::find($this->emailLogId);
        if (!$emailLog || $emailLog->status === 'sent') {
            return;
        }

        $recipient = User::find($emailLog->user_id);
        if (!$recipient || empty($recipient->email)) {
            $emailLog->update([
                'status' => 'failed',
                'error_message' => 'Recipient user or email address is missing.',
            ]);
            return;
        }

        // Re-check user settings immediately prior to dispatch (G2-079 Criterion 4)
        $eval = NotificationPreferenceService::shouldSendEmail($recipient, $emailLog->type);
        if (!$eval['allowed']) {
            $emailLog->update([
                'status' => $eval['reason'] ?? 'skipped by user setting',
            ]);
            return;
        }

        $notification = $emailLog->notification_id
            ? Notification::find($emailLog->notification_id)
            : new Notification([
                'user_id' => $emailLog->user_id,
                'type' => $emailLog->type,
                'module' => $emailLog->module,
                'title' => str_replace('[SERMS] ', '', $emailLog->subject),
                'message' => $emailLog->subject,
                'record_type' => $emailLog->record_type,
                'record_id' => $emailLog->record_id,
                'record_link' => $emailLog->record_link,
            ]);

        $attemptNumber = max(1, (int) $this->attempts());

        try {
            $details = is_array($notification?->metadata) ? $notification->metadata : [];
            Mail::to($recipient->email)->send(new NotificationMail($notification, $recipient, $details));

            $emailLog->update([
                'status' => 'sent',
                'attempts' => $attemptNumber,
                'sent_at' => now(),
                'error_message' => null,
            ]);
        } catch (\Throwable $e) {
            $emailLog->update([
                'attempts' => $attemptNumber,
                'error_message' => $e->getMessage(),
            ]);

            Log::error('SendNotificationEmailJob delivery attempt failed', [
                'email_log_id' => $emailLog->id,
                'recipient' => $recipient->email,
                'type' => $emailLog->type,
                'attempt' => $attemptNumber,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        $emailLog = EmailLog::find($this->emailLogId);
        if ($emailLog) {
            $emailLog->update([
                'status' => 'failed',
                'attempts' => max((int) $emailLog->attempts, 1),
                'error_message' => $exception->getMessage(),
            ]);
        }
    }
}
