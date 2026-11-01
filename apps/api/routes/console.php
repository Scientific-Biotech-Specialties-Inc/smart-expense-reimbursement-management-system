<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('receipts:warn-deletion')->daily();
Schedule::command('receipts:prune-orphans')->daily();
Schedule::command('penalties:calculate')->daily();
Schedule::command('notifications:check-liquidation-deadlines')->daily();

