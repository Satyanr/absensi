"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import SelfieCapture from "@/components/attendance/SelfieCapture";

type AttendanceMode = "OFFICE" | "PROJECT";

type SelfieSource = "WEB_CAMERA" | "WEB_FILE_CAPTURE";

type Employee = {
  employeeCode: string;
  name: string;
};

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  address: string | null;
};

type Attendance = {
  attendanceMode: AttendanceMode | null;

  checkedIn: boolean;
  checkedOut: boolean;

  checkInAt: string | null;

  checkOutAt: string | null;

  checkInStatus: string | null;

  checkOutStatus: string | null;
};

type ReverseGeocodeResult = {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  countryName?: string;
  postcode?: string;

  localityInfo?: {
    informative?: Array<{
      name?: string;
    }>;
  };
};

async function resolveLocationName(latitude: number, longitude: number) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "default",
    });

    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ReverseGeocodeResult;

    const parts: string[] = [];

    function addPart(value: string | undefined) {
      const clean = value?.trim();

      if (!clean) {
        return;
      }

      const alreadyExists = parts.some(
        (item) => item.toLowerCase() === clean.toLowerCase(),
      );

      if (!alreadyExists) {
        parts.push(clean);
      }
    }

    /*
     * informative biasanya bisa
     * berisi nama kawasan / area
     * yang lebih spesifik.
     */
    const informative = data.localityInfo?.informative ?? [];

    const mostSpecific = [...informative]
      .reverse()
      .find((item) => item.name?.trim())?.name;

    addPart(mostSpecific);
    addPart(data.locality);
    addPart(data.city);
    addPart(data.principalSubdivision);

    /*
     * Indonesia boleh tetap ditulis
     * supaya laporan historis jelas.
     */
    addPart(data.countryName);

    return parts.length ? parts.join(", ") : null;
  } catch {
    /*
     * Geocoder gagal tidak boleh
     * menggagalkan absensi.
     */
    return null;
  }
}

export default function HomePage() {
  const [employeeCode, setEmployeeCode] = useState("");

  const [employee, setEmployee] = useState<Employee | null>(null);

  const [attendance, setAttendance] = useState<Attendance | null>(null);

  const [attendanceMode, setAttendanceMode] =
    useState<AttendanceMode>("OFFICE");

  const [location, setLocation] = useState<LocationData | null>(null);

  const [selfie, setSelfie] = useState<File | null>(null);

  const [selfieSource, setSelfieSource] = useState<SelfieSource | null>(null);

  const [selfieResetKey, setSelfieResetKey] = useState(0);

  const [loading, setLoading] = useState(false);

  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [locationLoading, setLocationLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  async function searchEmployee(event: FormEvent) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setEmployee(null);
    setAttendance(null);

    const code = employeeCode.trim();

    if (!code) {
      setError("Kode karyawan wajib diisi.");

      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/employees/lookup?code=${encodeURIComponent(code)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Karyawan tidak ditemukan.");

        return;
      }

      setEmployee(data.employee);
    } catch {
      setError("Terjadi masalah jaringan.");
    } finally {
      setLoading(false);
    }
  }

  async function startAttendance() {
    if (!employee) {
      return;
    }

    setAttendanceLoading(true);

    setError("");

    try {
      const response = await fetch(
        `/api/attendance/today?employeeCode=${encodeURIComponent(
          employee.employeeCode,
        )}`,
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal mengambil status absensi.");

        return;
      }

      setAttendance(data.attendance);

      /*
       * Kalau hari ini sudah ada
       * attendance, mode mengikuti
       * database dan tidak boleh
       * berubah.
       */
      if (data.attendance?.attendanceMode) {
        setAttendanceMode(data.attendance.attendanceMode);
      }
    } catch {
      setError("Gagal mengambil status absensi.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  function captureLocation() {
    setError("");
    setLocationLoading(true);

    if (!navigator.geolocation) {
      setError("Browser tidak mendukung GPS.");

      setLocationLoading(false);

      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;

        const longitude = position.coords.longitude;

        const address = await resolveLocationName(latitude, longitude);

        setLocation({
          latitude,
          longitude,

          accuracy: position.coords.accuracy,

          capturedAt: new Date().toISOString(),

          address,
        });

        setLocationLoading(false);
      },

      (locationError) => {
        setLocationLoading(false);

        switch (locationError.code) {
          case locationError.PERMISSION_DENIED:
            setError("Izin lokasi ditolak.");

            break;

          case locationError.POSITION_UNAVAILABLE:
            setError("Lokasi tidak tersedia.");

            break;

          case locationError.TIMEOUT:
            setError("Pengambilan lokasi terlalu lama.");

            break;

          default:
            setError("Gagal mengambil lokasi.");
        }
      },

      {
        enableHighAccuracy: true,

        timeout: 15000,

        maximumAge: 0,
      },
    );
  }

  async function submitCheckIn() {
    if (!employee || !selfie || !selfieSource) {
      setError("Selfie wajib diambil.");

      return;
    }

    /*
     * OFFICE wajib GPS.
     *
     * PROJECT tidak wajib.
     */
    if (attendanceMode === "OFFICE" && !location) {
      setError("Lokasi wajib untuk absensi kantor.");

      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const form = new FormData();

      form.append("employeeCode", employee.employeeCode);

      form.append("attendanceMode", attendanceMode);

      /*
       * GPS hanya dikirim kalau
       * memang tersedia.
       */
      if (location) {
        form.append("latitude", String(location.latitude));

        form.append("longitude", String(location.longitude));

        form.append("accuracy", String(location.accuracy));

        form.append("locationCapturedAt", location.capturedAt);

        if (location.address) {
          form.append("address", location.address);
        }
      }

      form.append("clientCapturedAt", new Date().toISOString());

      form.append("source", selfieSource);

      form.append("photo", selfie);

      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal menyimpan absensi.");

        return;
      }

      setSuccess(data.message ?? "Absensi berhasil.");

      /*
       * Buang evidence lama.
       */
      setLocation(null);
      setSelfie(null);
      setSelfieSource(null);

      setSelfieResetKey((value) => value + 1);

      /*
       * Refresh status resmi
       * dari server.
       */
      await startAttendance();
    } catch {
      setError("Terjadi masalah jaringan saat mengirim absensi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCheckOut() {
    if (!employee || !location || !selfie || !selfieSource) {
      setError("GPS dan selfie wajib untuk absen pulang.");

      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const form = new FormData();

      form.append("employeeCode", employee.employeeCode);

      form.append("latitude", String(location.latitude));

      form.append("longitude", String(location.longitude));

      form.append("accuracy", String(location.accuracy));

      form.append("locationCapturedAt", location.capturedAt);

      form.append("clientCapturedAt", new Date().toISOString());

      if (location.address) {
        form.append("address", location.address);
      }

      form.append("source", selfieSource);

      form.append("photo", selfie);

      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Gagal melakukan absen pulang.");

        return;
      }

      setSuccess(data.message ?? "Absen pulang berhasil.");

      setLocation(null);
      setSelfie(null);
      setSelfieSource(null);

      setSelfieResetKey((value) => value + 1);

      await startAttendance();
    } catch {
      setError("Terjadi masalah jaringan saat mengirim absen pulang.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetEmployee() {
    setEmployeeCode("");
    setEmployee(null);
    setAttendance(null);

    setAttendanceMode("OFFICE");

    setLocation(null);
    setSelfie(null);
    setSelfieSource(null);

    setSelfieResetKey((value) => value + 1);

    setError("");
    setSuccess("");
  }

  function formatTime(value: string | null) {
    if (!value) {
      return "Belum";
    }

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",

      hour: "2-digit",

      minute: "2-digit",

      second: "2-digit",
    }).format(new Date(value));
  }

  const attendanceStarted = Boolean(attendance);

  const alreadyCheckedIn = Boolean(attendance?.checkedIn);

  const projectCompleted =
    attendance?.attendanceMode === "PROJECT" && attendance.checkedIn;

  const officeCompleted =
    attendance?.attendanceMode === "OFFICE" &&
    attendance.checkedIn &&
    attendance.checkedOut;

  const modeLocked = alreadyCheckedIn;

  const canSubmitCheckIn = Boolean(
    selfie && selfieSource && (attendanceMode === "PROJECT" || location),
  );

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Absensi Karyawan</h1>

          <p className="mt-2 text-sm text-neutral-500">
            Masukkan kode karyawan untuk memulai absensi.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-green-50 p-4 text-sm font-medium text-green-700">
            {success}
          </div>
        )}

        {!employee && (
          <form
            onSubmit={searchEmployee}
            className="rounded-2xl bg-white p-6 shadow-sm"
          >
            <label className="text-sm font-medium">Kode Karyawan</label>

            <input
              value={employeeCode}
              onChange={(event) => setEmployeeCode(event.target.value)}
              placeholder="Contoh: EMP001"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Mencari..." : "Cari Karyawan"}
            </button>
          </form>
        )}

        {employee && (
          <>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Karyawan
              </p>

              <h2 className="mt-1 text-xl font-bold">{employee.name}</h2>

              <p className="text-sm text-neutral-500">
                {employee.employeeCode}
              </p>

              {!attendanceStarted && (
                <button
                  type="button"
                  onClick={startAttendance}
                  disabled={attendanceLoading}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {attendanceLoading ? "Memuat..." : "Lanjut Absensi"}
                </button>
              )}

              <Link
                href={`/leave?employeeCode=${encodeURIComponent(
                  employee.employeeCode,
                )}`}
                className="mt-3 block w-full rounded-xl border border-blue-600 py-3 text-center font-semibold text-blue-600"
              >
                Ajukan Izin / Sakit / Cuti
              </Link>

              <button
                type="button"
                onClick={resetEmployee}
                className="mt-3 w-full text-sm font-medium text-neutral-500"
              >
                Ganti Karyawan
              </button>
            </div>

            {attendance && (
              <>
                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="font-semibold">Jenis Absensi</h2>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={modeLocked}
                      onClick={() => {
                        setAttendanceMode("OFFICE");

                        setError("");
                      }}
                      className={`rounded-xl border p-4 text-left ${
                        attendanceMode === "OFFICE"
                          ? "border-blue-600 bg-blue-50"
                          : "border-neutral-200"
                      } disabled:opacity-60`}
                    >
                      <div className="font-semibold">🏢 Kantor</div>

                      <div className="mt-1 text-xs text-neutral-500">
                        Jam kerja biasa
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={modeLocked}
                      onClick={() => {
                        setAttendanceMode("PROJECT");

                        setError("");
                      }}
                      className={`rounded-xl border p-4 text-left ${
                        attendanceMode === "PROJECT"
                          ? "border-blue-600 bg-blue-50"
                          : "border-neutral-200"
                      } disabled:opacity-60`}
                    >
                      <div className="font-semibold">🛠 In Project</div>

                      <div className="mt-1 text-xs text-neutral-500">
                        Waktu fleksibel
                      </div>
                    </button>
                  </div>

                  {attendanceMode === "PROJECT" && !alreadyCheckedIn && (
                    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      In Project menggunakan jam fleksibel dan tidak memerlukan
                      absen pulang.
                    </div>
                  )}
                </div>

                {alreadyCheckedIn && (
                  <div className="rounded-2xl bg-white p-5 shadow-sm">
                    <h2 className="font-semibold">Status Hari Ini</h2>

                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span>Jenis</span>

                        <span className="font-medium">
                          {attendance.attendanceMode === "PROJECT"
                            ? "In Project"
                            : "Kantor"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>Jam Masuk</span>

                        <span className="font-medium">
                          {formatTime(attendance.checkInAt)}
                        </span>
                      </div>

                      {attendance.attendanceMode === "OFFICE" && (
                        <div className="flex justify-between">
                          <span>Jam Pulang</span>

                          <span className="font-medium">
                            {formatTime(attendance.checkOutAt)}
                          </span>
                        </div>
                      )}

                      {attendance.attendanceMode === "PROJECT" && (
                        <div className="rounded-lg bg-green-50 p-3 font-medium text-green-700">
                          ✓ In Project tercatat
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!projectCompleted && !officeCompleted && (
                  <>
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-semibold">Lokasi</h2>

                          <p className="mt-1 text-xs text-neutral-500">
                            {attendanceMode === "PROJECT"
                              ? "Opsional untuk In Project"
                              : "Wajib untuk absensi kantor"}
                          </p>
                        </div>

                        {location && (
                          <span className="text-sm font-medium text-green-700">
                            ✓ Siap
                          </span>
                        )}
                      </div>

                      {location && (
                        <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                            Lokasi Terdeteksi
                          </p>

                          <p className="mt-1 text-sm font-semibold text-neutral-800">
                            {location.address ?? "Nama lokasi tidak tersedia"}
                          </p>

                          <p className="mt-1 text-xs text-neutral-500">
                            Akurasi GPS ±{Math.round(location.accuracy)} meter
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={captureLocation}
                        disabled={locationLoading}
                        className="mt-4 w-full rounded-xl border border-neutral-300 py-3 text-sm font-medium"
                      >
                        {locationLoading
                          ? "Mengambil Lokasi..."
                          : location
                            ? "Ambil Ulang Lokasi"
                            : "Ambil Lokasi"}
                      </button>
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                      <SelfieCapture
                        key={selfieResetKey}
                        onCapture={(file, source) => {
                          setSelfie(file);

                          setSelfieSource(source ?? null);
                        }}
                      />
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                      <h2 className="font-semibold">Persiapan Absensi</h2>

                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>GPS</span>

                          <span
                            className={
                              location
                                ? "font-medium text-green-700"
                                : attendanceMode === "PROJECT"
                                  ? "text-neutral-500"
                                  : "text-red-600"
                            }
                          >
                            {location
                              ? "✓ Siap"
                              : attendanceMode === "PROJECT"
                                ? "Opsional"
                                : "Wajib"}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span>Selfie</span>

                          <span
                            className={
                              selfie
                                ? "font-medium text-green-700"
                                : "text-red-600"
                            }
                          >
                            {selfie ? "✓ Siap" : "Wajib"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!alreadyCheckedIn && (
                      <button
                        type="button"
                        onClick={submitCheckIn}
                        disabled={!canSubmitCheckIn || submitting}
                        className={`w-full rounded-xl py-4 font-semibold text-white disabled:bg-neutral-300 disabled:text-neutral-500 ${
                          attendanceMode === "PROJECT"
                            ? "bg-amber-600"
                            : "bg-green-600"
                        }`}
                      >
                        {submitting
                          ? "Mengirim Absensi..."
                          : attendanceMode === "PROJECT"
                            ? "In Project"
                            : "Absen Masuk"}
                      </button>
                    )}

                    {alreadyCheckedIn &&
                      attendance.attendanceMode === "OFFICE" &&
                      !attendance.checkedOut && (
                        <button
                          type="button"
                          onClick={submitCheckOut}
                          disabled={
                            !location || !selfie || !selfieSource || submitting
                          }
                          className="w-full rounded-xl bg-blue-600 py-4 font-semibold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
                        >
                          {submitting ? "Mengirim Absensi..." : "Absen Pulang"}
                        </button>
                      )}
                  </>
                )}

                {projectCompleted && (
                  <div className="rounded-2xl bg-green-50 p-5 text-center">
                    <div className="text-lg font-bold text-green-700">
                      ✓ Absensi Selesai
                    </div>

                    <p className="mt-2 text-sm text-green-700">
                      In Project hari ini sudah tercatat.
                    </p>
                  </div>
                )}

                {officeCompleted && (
                  <div className="rounded-2xl bg-green-50 p-5 text-center">
                    <div className="text-lg font-bold text-green-700">
                      ✓ Absensi Selesai
                    </div>

                    <p className="mt-2 text-sm text-green-700">
                      Absen masuk dan pulang hari ini sudah tercatat.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="pb-6 text-center">
          <Link
            href="/admin/login"
            className="text-sm text-neutral-500 underline"
          >
            Login Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
