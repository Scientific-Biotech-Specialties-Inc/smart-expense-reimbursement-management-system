<?php

namespace App\Modules\Notifications\Mail;

use App\Modules\Notifications\Models\Notification;
use App\Modules\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class NotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public Notification $notification;
    public User $recipient;
    public array $details;
    public string $recordUrl;
    public string $settingsUrl;
    public string $formattedDate;

    public function __construct(Notification $notification, User $recipient, array $details = [])
    {
        $this->notification = $notification;
        $this->recipient = $recipient;
        $this->details = $details;

        $frontendBase = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5002')), '/');
        $rawLink = (string) ($notification->record_link ?? '/dashboard');
        $cleanLink = str_starts_with($rawLink, '/') ? $rawLink : '/' . $rawLink;

        $this->recordUrl = $frontendBase . $cleanLink;
        $this->settingsUrl = $frontendBase . '/settings/notifications';
        $this->formattedDate = ($notification->created_at ?? now())->format('M j, Y');
    }

    public function build(): self
    {
        $subject = '[SERMS] ' . ($this->notification->title ?: $this->notification->module);

        return $this->subject($subject)
            ->view('emails.sbsi-notification');
    }
}
