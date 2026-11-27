<?php
// Llama a la sincronización de UniHub en Vercel. Súbelo FUERA de public_html si el panel lo permite
// (si no, protégelo: no contiene datos, pero el secreto sí). Prográmalo cada 20–30 min con el cron del hosting:
//   php /home/USUARIO/cron-unihub.php
$url = 'https://TU-APP.vercel.app/api/cron/sync';
$secret = 'TU_CRON_SECRET';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $secret],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
]);
curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
// Código distinto de 200 → el panel del hosting suele avisar por correo de los errores de cron.
exit($code === 200 ? 0 : 1);
