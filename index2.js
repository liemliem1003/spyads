const puppeteer = require("puppeteer");
const axios = require("axios");
const XLSX = require('xlsx');
const fs = require("fs");

var ip_country = ''

async function GetInfo(keyword, profile_id) {
    var item = {
        ip_country: "",
        keyword: keyword,
        link: "",
        ads_name: "",
        location: ""
    }
    try {
        // Mở profile trên GPM-Login
        const { remote_debugging_address } = await OpenProfile(profile_id);
        
        if (!remote_debugging_address) throw new Error("⚠️ Không tìm thấy remote_debugging_address!");
        console.log(`🔗 Kết nối đến: http://${remote_debugging_address}`);

        // Kết nối Puppeteer với trình duyệt GPM-Login
        const browser = await puppeteer.connect({
            browserURL: `http://${remote_debugging_address}`,
            defaultViewport: null,
        });
        const page = await browser.newPage();
        ip_country = await checkCountry(page)
        
        item.ip_country = ip_country

        await page.goto('https://www.google.com/search?q=' + keyword, { waitUntil: 'load', timeout: 0 });

        const elementHandles = await page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('span'))
                .filter(el => el.innerText.includes('Được tài trợ'));
        });

        const properties = await elementHandles.getProperties();
        var i = 0
        for (const property of properties.values()) {
            const element = property.asElement();
            if (element && i < 1) {
                i++
                const parentHandle = await element.evaluateHandle(el => el.parentElement);

                const href1 = await parentHandle.evaluate(parent => {
                    return Array.from(parent.querySelectorAll('a')).map(a => a.href);
                });

                const href2 = await parentHandle.evaluate(parent => {
                    return Array.from(parent.querySelectorAll('a')).map(a => a.getAttribute('data-rw'));
                });

                const hrefs = [...href1, href2].flat()


                const filteredHrefs = hrefs.filter(href => href.startsWith('https://www.googleadservices.com'));

                if (filteredHrefs.length > 0) {
                    item.link = filteredHrefs[0]
                } else {
                    item.link = hrefs[0]
                }

                // Tìm nút theo aria-label và click
                const btnHandle = await parentHandle.evaluateHandle(el =>
                    el.querySelector('[aria-label="Tại sao lại là quảng cáo này?"]')
                );

                const btn = btnHandle.asElement();
                if (btn) {
                    await btn.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Tìm phần tử chứa 'Nhà quảng cáo'
                    const adsDivs = await page.$$('div');
                    let adsNameValue = 'Không tìm thấy';
                    for (const div of adsDivs) {
                        const text = await div.evaluate(el => el.innerText);
                        if (text.trim() === 'Nhà quảng cáo') {
                            const sibling = await div.evaluateHandle(el => el.nextElementSibling);
                            adsNameValue = await sibling.evaluate(el => el.innerText);
                            item.ads_name = adsNameValue
                            break;
                        }
                    }

                    // Tìm phần tử chứa 'Vị trí'
                    let locationValue = 'Không tìm thấy';
                    for (const div of adsDivs) {
                        const text = await div.evaluate(el => el.innerText);
                        if (text.trim() === 'Vị trí') {
                            const sibling = await div.evaluateHandle(el => el.nextElementSibling);
                            locationValue = await sibling.evaluate(el => el.innerText);
                            item.location = locationValue
                            break;
                        }
                    }

                } else {
                }

                // await new Promise(resolve => setTimeout(resolve, 100000)); // hoặc 100000 nếu bạn test
            }
            else {
                break
            }
        }
    } catch (err) {
        console.log(err);

    } finally {
        
        return item
    }
}

async function ToolAuTo() {
    var data = ReadExcelFile("input.xlsx")
    const profile_id = "1483a808-d496-4be7-ab90-f9fbd740d00e"
    var currentProxy = null
    var dataToExport = []
    for (let i = 0; i < data.length; i++) {
        console.log(i);
        await UpdateProxy(profile_id, currentProxy)
        var result = await GetInfo(data[i].keyword, profile_id)
        dataToExport.push(result)
    }
    console.log(dataToExport);

    // await UpdateProxy(profile_id, "")
    for (let i = 0; i < dataToExport.length; i++) {
        console.log("hahaha");
        
        dataToExport[i].link = await CheckLink(result.link, profile_id)

    }
    dataToExport.length > 0 ? ExportToExcel(dataToExport) : true
    await CloseProfile(profile_id)
}



async function OpenProfile(profile_id) {
    // await UpdateProxy('1483a808-d496-4be7-ab90-f9fbd740d00e', 'p.webshare.io:80:ycovlmxv-4:zpesxkuiusk4')

    try {
        const response = await axios.get(`http://127.0.0.1:19995/api/v3/profiles/start/${profile_id}`);
        const { remote_debugging_address } = response.data.data;

        if (!remote_debugging_address) {
            throw new Error("⚠️ API không trả về remote_debugging_address!");
        }

        await waitForBrowser(remote_debugging_address);
        return { remote_debugging_address };
    } catch (error) {
        console.error("❌ Lỗi khi mở profile:", error.message);
    }
}

// Chờ trình duyệt sẵn sàng
async function waitForBrowser(remote_debugging_address, maxRetries = 10, delayMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(`http://${remote_debugging_address}/json/version`);
            if (response.data.webSocketDebuggerUrl) {
                console.log("✅ Trình duyệt đã sẵn sàng!");
                return response.data.webSocketDebuggerUrl;
            }
        } catch (error) {
            console.log(`⏳ Chờ trình duyệt mở... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw new Error("Trình duyệt không sẵn sàng sau thời gian chờ.");
}

// Đóng profile khi xong
async function CloseProfile(profile_id) {
    try {
        await axios.get(`http://127.0.0.1:19995/api/v3/profiles/close/${profile_id}`);
        console.log("✅ Profile đã đóng.");
    } catch (error) {
        console.error("❌ Lỗi khi đóng profile:", error.message);
    }
}

function ReadExcelFile(path) {
    const workbook = XLSX.readFile(path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    return data
}
function ExportToExcel(data) {
    try {
        const fileName = getFormattedDate();
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        XLSX.writeFile(workbook, fileName);

        console.log(`✅ File ${fileName} đã được tạo thành công!`);
    } catch (error) {
        console.error("❌ Lỗi xuất file Excel:", error.message);
    }
}

function getFormattedDate() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0"); // Tháng bắt đầu từ 0
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `data/data_${dd}_${mm}_${yyyy}_${hh}_${min}.xlsx`;
}
async function CheckLink(link, profile_id) {
    var linkReturn = link
    try {
        // Mở profile trên GPM-Login
        const { remote_debugging_address } = await OpenProfile(profile_id);
        if (!remote_debugging_address) throw new Error("⚠️ Không tìm thấy remote_debugging_address!");
        console.log(`🔗 Kết nối đến: http://${remote_debugging_address}`);

        // Kết nối Puppeteer với trình duyệt GPM-Login
        const browser = await puppeteer.connect({
            browserURL: `http://${remote_debugging_address}`,
            defaultViewport: null,
        });
        const page = await browser.newPage();
        await page.goto(link, { waitUntil: 'load', timeout: 0 });
        const currentURL = await page.url();
        linkReturn = currentURL
    } catch (err) {
        console.log(err);
    } finally {

    }
    return linkReturn
}
async function UpdateProxy(profile_id, proxyString, profileName = "GPM-Auto", color = "#00FF00") {
    try {
        const payload = {
            profile_name: profileName,
            raw_proxy: proxyString,
            color: color,
            user_agent: "auto"
        };

        const response = await axios.post(`http://127.0.0.1:19995/api/v3/profiles/update/${profile_id}`, payload);
        if (response.data.success) {
            console.log("✅ Proxy và thông tin profile đã được cập nhật thành công!");
        } else {
            console.log("⚠️ Cập nhật thất bại:", response.data);
        }
    } catch (error) {
        console.error("❌ Lỗi khi cập nhật proxy:", error.message);
    } finally {
        await CloseProfile(profile_id)
    }
}
async function checkCountry(page) {
    try {
        await page.goto('https://ipinfo.io/json', { waitUntil: 'networkidle2' });
        const info = await page.evaluate(() => JSON.parse(document.body.innerText));
        var returnData = countryCodeToName[info.country] ? countryCodeToName[info.country] : info.country
        return returnData
    } catch (err) {
        console.error("❌ Không thể lấy IP:", err.message);
        return null;
    }
}

const countryCodeToName = {
    AF: "Afghanistan",
    AL: "Albania",
    DZ: "Algeria",
    AS: "American Samoa",
    AD: "Andorra",
    AO: "Angola",
    AI: "Anguilla",
    AQ: "Antarctica",
    AG: "Antigua and Barbuda",
    AR: "Argentina",
    AM: "Armenia",
    AW: "Aruba",
    AU: "Úc",
    AT: "Áo",
    AZ: "Azerbaijan",
    BS: "Bahamas",
    BH: "Bahrain",
    BD: "Bangladesh",
    BB: "Barbados",
    BY: "Belarus",
    BE: "Bỉ",
    BZ: "Belize",
    BJ: "Benin",
    BM: "Bermuda",
    BT: "Bhutan",
    BO: "Bolivia",
    BA: "Bosnia và Herzegovina",
    BW: "Botswana",
    BR: "Brazil",
    BN: "Brunei",
    BG: "Bulgaria",
    BF: "Burkina Faso",
    BI: "Burundi",
    KH: "Campuchia",
    CM: "Cameroon",
    CA: "Canada",
    CV: "Cape Verde",
    CF: "Central African Republic",
    TD: "Chad",
    CL: "Chile",
    CN: "Trung Quốc",
    CO: "Colombia",
    KM: "Comoros",
    CG: "Congo (Brazzaville)",
    CD: "Congo (Kinshasa)",
    CR: "Costa Rica",
    CI: "Côte d’Ivoire",
    HR: "Croatia",
    CU: "Cuba",
    CY: "Cyprus",
    CZ: "Czechia",
    DK: "Đan Mạch",
    DJ: "Djibouti",
    DM: "Dominica",
    DO: "Dominican Republic",
    EC: "Ecuador",
    EG: "Ai Cập",
    SV: "El Salvador",
    GQ: "Equatorial Guinea",
    ER: "Eritrea",
    EE: "Estonia",
    SZ: "Eswatini",
    ET: "Ethiopia",
    FJ: "Fiji",
    FI: "Phần Lan",
    FR: "Pháp",
    GA: "Gabon",
    GM: "Gambia",
    GE: "Georgia",
    DE: "Đức",
    GH: "Ghana",
    GR: "Hy Lạp",
    GD: "Grenada",
    GT: "Guatemala",
    GN: "Guinea",
    GW: "Guinea-Bissau",
    GY: "Guyana",
    HT: "Haiti",
    HN: "Honduras",
    HU: "Hungary",
    IS: "Iceland",
    IN: "Ấn Độ",
    ID: "Indonesia",
    IR: "Iran",
    IQ: "Iraq",
    IE: "Ireland",
    IL: "Israel",
    IT: "Ý",
    JM: "Jamaica",
    JP: "Nhật Bản",
    JO: "Jordan",
    KZ: "Kazakhstan",
    KE: "Kenya",
    KI: "Kiribati",
    KP: "Triều Tiên",
    KR: "Hàn Quốc",
    KW: "Kuwait",
    KG: "Kyrgyzstan",
    LA: "Lào",
    LV: "Latvia",
    LB: "Lebanon",
    LS: "Lesotho",
    LR: "Liberia",
    LY: "Libya",
    LI: "Liechtenstein",
    LT: "Lithuania",
    LU: "Luxembourg",
    MG: "Madagascar",
    MW: "Malawi",
    MY: "Malaysia",
    MV: "Maldives",
    ML: "Mali",
    MT: "Malta",
    MH: "Marshall Islands",
    MR: "Mauritania",
    MU: "Mauritius",
    MX: "Mexico",
    FM: "Micronesia",
    MD: "Moldova",
    MC: "Monaco",
    MN: "Mông Cổ",
    ME: "Montenegro",
    MA: "Morocco",
    MZ: "Mozambique",
    MM: "Myanmar",
    NA: "Namibia",
    NR: "Nauru",
    NP: "Nepal",
    NL: "Hà Lan",
    NZ: "New Zealand",
    NI: "Nicaragua",
    NE: "Niger",
    NG: "Nigeria",
    MK: "North Macedonia",
    NO: "Na Uy",
    OM: "Oman",
    PK: "Pakistan",
    PW: "Palau",
    PA: "Panama",
    PG: "Papua New Guinea",
    PY: "Paraguay",
    PE: "Peru",
    PH: "Philippines",
    PL: "Ba Lan",
    PT: "Bồ Đào Nha",
    QA: "Qatar",
    RO: "Romania",
    RU: "Nga",
    RW: "Rwanda",
    KN: "Saint Kitts và Nevis",
    LC: "Saint Lucia",
    VC: "Saint Vincent và Grenadines",
    WS: "Samoa",
    SM: "San Marino",
    ST: "Sao Tome và Principe",
    SA: "Ả Rập Saudi",
    SN: "Senegal",
    RS: "Serbia",
    SC: "Seychelles",
    SL: "Sierra Leone",
    SG: "Singapore",
    SK: "Slovakia",
    SI: "Slovenia",
    SB: "Solomon Islands",
    SO: "Somalia",
    ZA: "Nam Phi",
    SS: "Nam Sudan",
    ES: "Tây Ban Nha",
    LK: "Sri Lanka",
    SD: "Sudan",
    SR: "Suriname",
    SE: "Thụy Điển",
    CH: "Thụy Sĩ",
    SY: "Syria",
    TW: "Đài Loan",
    TJ: "Tajikistan",
    TZ: "Tanzania",
    TH: "Thái Lan",
    TL: "Đông Timor",
    TG: "Togo",
    TO: "Tonga",
    TT: "Trinidad và Tobago",
    TN: "Tunisia",
    TR: "Thổ Nhĩ Kỳ",
    TM: "Turkmenistan",
    TV: "Tuvalu",
    UG: "Uganda",
    UA: "Ukraine",
    AE: "Các Tiểu Vương quốc Ả Rập Thống nhất",
    GB: "Vương quốc Anh",
    US: "Hoa Kỳ",
    UY: "Uruguay",
    UZ: "Uzbekistan",
    VU: "Vanuatu",
    VE: "Venezuela",
    VN: "Việt Nam",
    YE: "Yemen",
    ZM: "Zambia",
    ZW: "Zimbabwe"
};

async function getProfileById(profileId) {
    try {
        const response = await axios.get(`http://127.0.0.1:19995/api/v3/profiles/${profileId}`);
        console.log(response.data);

        if (response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.message || 'Không lấy được thông tin profile');
        }
    } catch (error) {
        console.error('Lỗi khi lấy profile:', error.message);
        throw error;
    }
}

ToolAuTo()
// UpdateProxy("1483a808-d496-4be7-ab90-f9fbd740d00e", "p.webshare.io:80:ycovlmxv-1:zpesxkuiusk4")
// 1483a808-d496-4be7-ab90-f9fbd740d00e
// UpdateProxy("1483a808-d496-4be7-ab90-f9fbd740d00e", "")
// getProfileById("1483a808-d496-4be7-ab90-f9fbd740d00e")
