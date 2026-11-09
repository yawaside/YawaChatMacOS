using System.Globalization;
using System.Text;

namespace YawaChat;

/// <summary>
/// Токен подключения к сервису озвучки Microsoft (заголовок Sec-MS-GEC, версия 2).
///
/// С 13 октября 2026 сервис принимает только токены версии 2: обычный SHA-256
/// от «время + токен клиента» больше не подходит, потому что в дайджест
/// добавлено перемешивание младших слов (CS64) и изменённые константы раундов.
/// Без верного токена КАЖДОЕ подключение отклоняется ответом 403, поэтому
/// фраза уходит на системный голос — так выглядит «озвучка отвалилась».
///
/// Токен — это 81 символ: 16 шестнадцатеричных цифр перемешанного дайджеста,
/// дефис и 64 цифры обычного дайджеста. Время берётся в формате Windows
/// (от 1601 года), отбрасывается до пятиминутных шагов и умножается на 10^7,
/// как это делает сам Edge в браузере.
///
/// Алгоритм совпадает с эталонной реализацией edge-tts (drm.py, версия 2);
/// совпадение закреплено тестами на готовых значениях времени.
/// </summary>
internal static class SecMsGec
{
    /// <summary>Токен клиента Edge Read Aloud — тот же, что в адресе сервиса.</summary>
    internal const string TrustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

    /// <summary>Секунды между 1601-01-01 и 1970-01-01 (формат Windows).</summary>
    private const double WindowsEpochSeconds = 11644473600d;

    /// <summary>Шаг времени в токене: сервис принимает метку, кратную 5 минутам.</summary>
    private const double StepSeconds = 300d;

    private const ulong Mask = 0xFFFFFFFFUL;

    private const uint Sha256Adjustment = 0xC9DC06A7;
    private const uint Sigma0Adjustment = 0x059C0B80;
    private const uint Sigma1Adjustment = 0x000B92C0;

    private const uint CsFactor = 0x82893933;
    private const uint CsAdjustment0 = 0xF2F90B1A;
    private const uint CsAdjustment1 = 0x0B1A0000;

    private static readonly uint[] Sha256Initial =
    {
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C,
        0x1F83D9AB, 0x5BE0CD19,
    };

    private static readonly uint[] Sha256State =
    {
        0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB,
        0xFEB0A7E4, 0x03EFFBD2,
    };

    private static readonly uint[] Sha256Schedule =
    {
        0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491,
        0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
        0xD258B060, 0x72766564,
    };

    private static readonly uint[] RoundConstants =
    {
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1,
        0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
        0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786,
        0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147,
        0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
        0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B,
        0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A,
        0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
        0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
    };

    private static readonly uint[] BlockConstants =
    {
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1,
        0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
        0x72BE5D74, 0x80DEB1FE, 0xC9DC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786,
        0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
        0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147,
        0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
        0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B,
        0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
        0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A,
        0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
        0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
    };

    private static readonly uint[] CsCoefficients =
    {
        0xE82E91B1, 0x44DE24C6, 0x3BEB65BC, 0xC89C5933, 0x8D1EC211, 0x314EF5D5,
        0xE92491B1, 0xF0A5B9D5, 0x06064CF3, 0xDA79FA60, 0xBED20560, 0x89F9C9F8,
        0x35FA38C6, 0xCB49E3C6,
    };

    private static readonly uint[] CsOffsets =
    {
        0xB32700D0, 0x88DFF51D, 0x29514038, 0xB328CBDF, 0xD405B4D5, 0x26E55F3C,
        0x607801C6, 0x82B2C1FB, 0xFA51A3DA, 0x207CC464, 0x3C3C74F3, 0xD2D14B61,
        0xBB04A2C1, 0xC5626167,
    };

    /// <summary>Токен для текущего момента.</summary>
    internal static string Generate() =>
        Generate(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000d);

    /// <summary>Токен для заданного момента (unix-секунды) — так его проверяют тесты.</summary>
    internal static string Generate(double unixSeconds)
    {
        var ticks = unixSeconds + WindowsEpochSeconds;
        ticks -= ticks % StepSeconds;
        ticks *= 1e7;
        var moment = ((long)Math.Round(ticks, MidpointRounding.ToEven))
            .ToString(CultureInfo.InvariantCulture);
        var salt = Encoding.ASCII.GetBytes(moment + TrustedClientToken);

        var digest = Sha256Digest(salt);
        var (mixedLow, mixedHigh) = Mix64(salt, digest);
        return LittleEndianHex(mixedLow) + LittleEndianHex(mixedHigh) + "-" + Convert.ToHexString(digest);
    }

    /* ---------- перемешивание CS64 ---------- */

    /// <summary>
    /// Перемешивание дайджеста: два 32-битных слова, зависящих от первых слов
    /// дайджеста и от самого текста. Точный порядок операций важен — любая
    /// перестановка даёт другой токен и отказ 403.
    /// </summary>
    private static (uint Low, uint High) Mix64(byte[] salt, byte[] digest)
    {
        var keyA = (ReadUInt32LittleEndian(digest, 0) | 1u);
        var keyB = (ReadUInt32LittleEndian(digest, 4) | 1u);
        var factors = new[] { (ulong)keyA * CsFactor & Mask, (ulong)keyB * CsFactor & Mask };

        var terms = new List<ulong>(CsCoefficients.Length + salt.Length + 2);
        var offsets = new List<ulong>(CsCoefficients.Length + salt.Length + 2);
        for (var i = 0; i < CsCoefficients.Length; i++)
        {
            terms.Add((ulong)CsCoefficients[i] * factors[i % 2] & Mask);
            offsets.Add(CsOffsets[i]);
        }

        var words = LittleEndianWords(salt);
        for (var index = 0; index < words.Count; index++)
        {
            var word = (ulong)words[index];
            var term = word * (index % 2 == 0 ? keyA : keyB);
            var offset = Rol16(word) * (index % 2 == 0 ? 0xEF0569FBUL : 0xC31713DBUL);
            if (index == 0)
            {
                term += (ulong)CsAdjustment0 * factors[0];
                offset += CsAdjustment1;
            }
            terms.Add(term & Mask);
            offsets.Add(offset & Mask);
        }

        ulong swapAcc = 0, swapLast = 0, state = 0, acc = 0;
        for (var index = 0; index < terms.Count; index += 2)
        {
            var x = terms[index];
            var y = terms[index + 1];

            var t = Rol16((offsets[index] + x) & Mask);
            var q = t * 0x76F50F34UL & Mask;
            swapAcc = (swapAcc + ((Rol16(q) * 0xC3EFEA97UL + q) & Mask)) & Mask;

            t = Rol16((offsets[index + 1] + y) & Mask);
            q = t * 0x1881CE3CUL & Mask;
            swapLast = (Rol16(q) * 0x35BD1EC9UL + q) & Mask;
            swapAcc = (swapAcc + swapLast) & Mask;

            state = (state * keyA + x) & Mask;
            state = Rol16(state) * 0xCF98B111UL & Mask;
            state = Rol16(state) * 0x87085B9FUL & Mask;
            state = Rol16(state) * 0x12CEB96DUL & Mask;
            state = Rol16(state) * 0x257E1D83UL & Mask;
            acc = (acc + state) & Mask;

            t = (state * keyB + y) & Mask;
            t = Rol16(t) * 0xA27416F5UL & Mask;
            t = Rol16(t) * 0xD38396FFUL & Mask;
            state = Rol16(Rol16(t) * 0x7C932B89UL & Mask) * 0xBFA49F69UL & Mask;
            acc = (acc + state) & Mask;
        }

        return ((uint)(swapLast ^ state), (uint)(swapAcc ^ acc));
    }

    /* ---------- изменённый SHA-256 ---------- */

    /// <summary>Дайджест SHA-256 с изменёнными начальными словами и константами раундов.</summary>
    private static byte[] Sha256Digest(byte[] salt)
    {
        var length = 57 + salt.Length;
        var tail = salt.AsSpan(7).ToArray();
        var zeros = ((55 - length) % 64 + 64) % 64;
        var padded = new byte[tail.Length + 1 + zeros + 8];
        tail.CopyTo(padded, 0);
        padded[tail.Length] = 0x80;
        var bits = (ulong)(length * 8);
        for (var i = 0; i < 8; i++)
            padded[padded.Length - 1 - i] = (byte)(bits >> (8 * i));

        var state = Sha256Init(salt.AsSpan(0, 7).ToArray());
        for (var offset = 0; offset < padded.Length; offset += 64)
        {
            var words = new List<ulong>(64);
            for (var i = 0; i < 16; i++)
                words.Add(ReadUInt32BigEndian(padded, offset + i * 4));
            Expand(words);
            var working = Rounds(state, words);
            for (var i = 0; i < 8; i++) state[i] = (state[i] + working[i]) & Mask;
        }

        var digest = new byte[32];
        for (var i = 0; i < 8; i++)
        {
            var word = (uint)state[i];
            digest[i * 4] = (byte)(word >> 24);
            digest[i * 4 + 1] = (byte)(word >> 16);
            digest[i * 4 + 2] = (byte)(word >> 8);
            digest[i * 4 + 3] = (byte)word;
        }
        return digest;
    }

    private static ulong[] Sha256Init(byte[] head)
    {
        var words = new List<ulong>(64);
        for (var i = 0; i < 14; i++) words.Add(0);
        words.Add((ulong)((head[0] << 16) | (head[1] << 8) | head[2]));
        words.Add(ReadUInt32BigEndian(head, 3));

        for (var index = 16; index < 30; index++)
        {
            var value = (ulong)Sha256Schedule[index - 16];
            if (index - 2 >= 14)
            {
                var s = Sigma1(words[index - 2]);
                value += index == 16 ? s ^ Sigma1Adjustment : s;
            }
            if (index - 7 >= 14) value += words[index - 7];
            if (index - 15 >= 14)
            {
                var s = Sigma0(words[index - 15]);
                value += index == 29 ? s ^ Sigma0Adjustment : s;
            }
            words.Add(value & Mask);
        }

        words.Add((Sigma1(words[28]) + words[23] + Sigma0(words[15]) + words[14] +
                   Sha256Adjustment - RoundConstants[14]) & Mask);
        Expand(words, 31);

        var working = Rounds(Sha256State.Select(v => (ulong)v).ToArray(), words, 14);
        var state = new ulong[8];
        for (var i = 0; i < 8; i++) state[i] = (Sha256Initial[i] + working[i]) & Mask;
        return state;
    }

    private static void Expand(List<ulong> words, int firstWord = 16)
    {
        for (var index = firstWord; index < 64; index++)
            words.Add((Sigma1(words[index - 2]) + words[index - 7] +
                       Sigma0(words[index - 15]) + words[index - 16]) & Mask);
    }

    private static ulong[] Rounds(ulong[] state, List<ulong> words, int firstRound = 0)
    {
        ulong a = state[0], b = state[1], c = state[2], d = state[3];
        ulong e = state[4], f = state[5], g = state[6], h = state[7];
        var constants = firstRound == 14 ? BlockConstants : RoundConstants;
        var aligned = Math.Min(64, firstRound + 7) / 8 * 8;
        if (aligned > firstRound)
        {
            for (var index = firstRound; index < aligned; index++)
            {
                var rotE = e * 0x100000001UL;
                var rotA = a * 0x100000001UL;
                var t1 = h + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (g ^ (e & (f ^ g))) +
                         constants[index] + words[index];
                var t2 = ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((a & b) | (c & (a | b)));
                /* Сдвиг всех регистров, а не только первых пяти: развёрнутый
                   блок раундов ниже рассчитан на это смещение ролей. */
                (a, b, c, d, e, f, g, h) = ((t1 + t2) & Mask, a, b, c, (d + t1) & Mask, e, f, g);
            }
        }

        for (var index = aligned; index < 64; index += 8)
        {
            var rotE = e * 0x100000001UL;
            var rotA = a * 0x100000001UL;
            var t1 = h + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (g ^ (e & (f ^ g))) +
                     constants[index] + words[index];
            d = (d + t1) & Mask;
            h = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((a & b) | (c & (a | b)))) & Mask;

            rotE = d * 0x100000001UL;
            rotA = h * 0x100000001UL;
            t1 = g + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (f ^ (d & (e ^ f))) +
                 constants[index + 1] + words[index + 1];
            c = (c + t1) & Mask;
            g = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((h & a) | (b & (h | a)))) & Mask;

            rotE = c * 0x100000001UL;
            rotA = g * 0x100000001UL;
            t1 = f + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (e ^ (c & (d ^ e))) +
                 constants[index + 2] + words[index + 2];
            b = (b + t1) & Mask;
            f = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((g & h) | (a & (g | h)))) & Mask;

            rotE = b * 0x100000001UL;
            rotA = f * 0x100000001UL;
            t1 = e + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (d ^ (b & (c ^ d))) +
                 constants[index + 3] + words[index + 3];
            a = (a + t1) & Mask;
            e = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((f & g) | (h & (f | g)))) & Mask;

            rotE = a * 0x100000001UL;
            rotA = e * 0x100000001UL;
            t1 = d + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (c ^ (a & (b ^ c))) +
                 constants[index + 4] + words[index + 4];
            h = (h + t1) & Mask;
            d = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((e & f) | (g & (e | f)))) & Mask;

            rotE = h * 0x100000001UL;
            rotA = d * 0x100000001UL;
            t1 = c + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (b ^ (h & (a ^ b))) +
                 constants[index + 5] + words[index + 5];
            g = (g + t1) & Mask;
            c = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((d & e) | (f & (d | e)))) & Mask;

            rotE = g * 0x100000001UL;
            rotA = c * 0x100000001UL;
            t1 = b + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (a ^ (g & (h ^ a))) +
                 constants[index + 6] + words[index + 6];
            f = (f + t1) & Mask;
            b = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((c & d) | (e & (c | d)))) & Mask;

            rotE = f * 0x100000001UL;
            rotA = b * 0x100000001UL;
            t1 = a + ((rotE >> 6) ^ (rotE >> 11) ^ (rotE >> 25)) + (h ^ (f & (g ^ h))) +
                 constants[index + 7] + words[index + 7];
            e = (e + t1) & Mask;
            a = (t1 + ((rotA >> 2) ^ (rotA >> 13) ^ (rotA >> 22)) + ((b & c) | (d & (b | c)))) & Mask;
        }

        return new[] { a, b, c, d, e, f, g, h };
    }

    /* ---------- побитовые помощники ---------- */

    private static ulong Rol16(ulong value)
    {
        value &= Mask;
        return ((value << 16) | (value >> 16)) & Mask;
    }

    private static ulong Sigma0(ulong value) =>
        ((value >> 7) ^ (value << 25) ^ (value >> 18) ^ (value << 14) ^ (value >> 3)) & Mask;

    private static ulong Sigma1(ulong value) =>
        ((value >> 17) ^ (value << 15) ^ (value >> 19) ^ (value << 13) ^ (value >> 10)) & Mask;

    private static uint ReadUInt32BigEndian(IReadOnlyList<byte> data, int offset) =>
        (uint)((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]);

    private static uint ReadUInt32LittleEndian(IReadOnlyList<byte> data, int offset) =>
        (uint)(data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24));

    private static string LittleEndianHex(uint value) =>
        $"{value & 0xFF:X2}{(value >> 8) & 0xFF:X2}{(value >> 16) & 0xFF:X2}{(value >> 24) & 0xFF:X2}";

    /// <summary>
    /// Слова по 4 байта little-endian от «нулевой байт + текст»; нечётное
    /// количество слов добивается нулём — так устроен вход перемешивания.
    /// </summary>
    private static List<uint> LittleEndianWords(byte[] salt)
    {
        var padded = new byte[salt.Length + 1];
        padded[0] = 0;
        salt.CopyTo(padded, 1);
        var tail = padded.Length % 4;
        if (tail != 0)
        {
            var extended = new byte[padded.Length + (4 - tail)];
            padded.CopyTo(extended, 0);
            padded = extended;
        }

        var words = new List<uint>(padded.Length / 4 + 1);
        for (var offset = 0; offset < padded.Length; offset += 4)
            words.Add(ReadUInt32LittleEndian(padded, offset));
        if (words.Count % 2 != 0) words.Add(0);
        return words;
    }
}
