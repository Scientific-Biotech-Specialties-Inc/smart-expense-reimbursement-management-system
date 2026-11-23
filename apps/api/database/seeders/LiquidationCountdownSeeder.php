<?php

namespace Database\Seeders;

use App\Modules\Liquidations\Database\Seeders\LiquidationCountdownTestSeeder;
use Illuminate\Database\Seeder;

class LiquidationCountdownSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(LiquidationCountdownTestSeeder::class);
    }
}
