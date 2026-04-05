document.addEventListener("DOMContentLoaded", function () {

    // ================================
    // SUPABASE CONFIGURATION
    // ================================
    const SUPABASE_URL      = "https://elhshkzfiqmyisxavnsh.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k";

    // ✅ Exact bucket name from your Supabase Storage
    const PROFILE_IMAGE_BUCKET = "profile-images";  // ✅ Exact bucket name from Supabase Storage

    let supabaseClient = null;

    function getSupabaseClient() {
        if (!supabaseClient) {
            if (!window.supabase || typeof window.supabase.createClient !== "function") {
                throw new Error("Supabase client library not loaded.");
            }
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return supabaseClient;
    }

    // ================================
    // SESSION HELPERS
    // currentUserEmail → set by login_page.html after every login
    // currentUserId    → integer id from your users table, set after first load
    // ================================
    function getCurrentUserEmail() {
        return localStorage.getItem("currentUserEmail");
    }

    function getCurrentUserId() {
        return localStorage.getItem("currentUserId");
    }

    function getProfileKey() {
        const id = getCurrentUserId();
        return id ? "userProfile_" + id : "userProfile_guest";
    }

    // ================================
    // ELEMENTS
    // ================================
    const editBtn             = document.querySelector(".edit-btn");
    const firstName           = document.getElementById("firstName");
    const lastName            = document.getElementById("lastName");
    const emailField          = document.getElementById("email");
    const contact             = document.getElementById("contactNumber");
    const profileImage        = document.getElementById("profileImage");
    const sidebarProfileImage = document.getElementById("sidebarProfileImage");
    const sidebarUserName     = document.getElementById("sidebarUserName");
    const imageUpload         = document.getElementById("imageUpload");
    const editImageBtn        = document.getElementById("editImageBtn");
    const profileNameDisplay  = document.querySelector(".profile-info h2");
    const profileEmailDisplay = document.getElementById("profileEmailDisplay");
    const emailSectionDisplay = document.getElementById("emailSectionDisplay");

    let isEditing = false;
    editBtn.textContent = "✏️ Edit";

    // ✅ Email always read-only
    if (emailField) {
        emailField.readOnly              = true;
        emailField.style.backgroundColor = "#f0f0f0";
        emailField.style.cursor          = "not-allowed";
        emailField.title                 = "Email cannot be changed here.";
    }

    if (sidebarUserName) sidebarUserName.style.color = "navy";

    // ================================
    // DROPDOWN MENU
    // ================================
    const menu = document.createElement("div");
    menu.style.position     = "absolute";
    menu.style.background   = "#fff";
    menu.style.borderRadius = "8px";
    menu.style.boxShadow    = "0 4px 12px rgba(0,0,0,0.2)";
    menu.style.display      = "none";
    menu.style.padding      = "8px 0";
    menu.style.width        = "180px";
    menu.style.zIndex       = "999";
    menu.style.transition   = "all 0.2s ease";
    menu.innerHTML = `
        <div id="uploadPhotoOption" style="padding:10px; cursor:pointer;">Upload Photo</div>
        <div id="removePhotoOption" style="padding:10px; cursor:pointer;">Remove Photo</div>
        <div id="viewPhotoOption"   style="padding:10px; cursor:pointer;">View Profile Picture</div>
    `;
    document.body.appendChild(menu);

    editImageBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const rect = editImageBtn.getBoundingClientRect();
        menu.style.top  = rect.bottom + window.scrollY + 5 + "px";
        menu.style.left = rect.left   + window.scrollX + "px";
        menu.style.display = menu.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", function () {
        menu.style.display = "none";
    });

    // ================================
    // SYNC IMAGES (MAIN + SIDEBAR)
    // ================================
    function syncProfileImages(imageSrc) {
        if (!imageSrc || imageSrc === "null" || imageSrc === "undefined") {
            imageSrc = "default-profile.png";
        }
        if (profileImage)        profileImage.src = imageSrc;
        if (sidebarProfileImage) sidebarProfileImage.src = imageSrc;
    }

    // ================================
    // SYNC ALL 3 EMAIL SPOTS
    // ================================
    function syncEmailDisplays(email) {
        const val = email || "";
        if (emailField)          emailField.value = val;
        if (profileEmailDisplay) profileEmailDisplay.textContent = val;
        if (emailSectionDisplay) emailSectionDisplay.textContent = val;
    }

    // ================================
    // UPDATE ALL PROFILE FIELDS ON PAGE
    // ================================
    function updateProfileDisplay(profileData) {
        if (!profileData) return;

        if (firstName) firstName.value = profileData.firstName || profileData.first_name || "";
        if (lastName)  lastName.value  = profileData.lastName  || profileData.last_name  || "";
        if (contact)   contact.value   = profileData.contact   || profileData.phone_number || "";

        syncEmailDisplays(profileData.email || "");

        const fullName = (
            (profileData.firstName || profileData.first_name || "").trim() +
            " " +
            (profileData.lastName  || profileData.last_name  || "").trim()
        ).trim();

        if (profileNameDisplay) profileNameDisplay.textContent = fullName;
        if (sidebarUserName)    sidebarUserName.textContent    = fullName;

        const img = profileData.image || profileData.profile_image || "default-profile.png";
        syncProfileImages(img);
    }

    // ================================
    // BROADCAST TO OTHER TABS
    // ================================
    function broadcastProfileUpdate(profileData) {
        const key = "profileUpdate_" + (getCurrentUserId() || "guest");
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), profile: profileData }));
        setTimeout(() => localStorage.removeItem(key), 100);
    }

    // ================================
    // LISTEN FOR CHANGES FROM OTHER TABS
    // ================================
    function listenForProfileChanges() {
        window.addEventListener("storage", function (e) {
            if (e.key === getProfileKey() && e.newValue) {
                try { updateProfileDisplay(JSON.parse(e.newValue)); } catch (_) {}
            }
        });
    }

    // ================================
    // LOAD PROFILE FROM SUPABASE
    // Uses currentUserEmail (saved at login) to find the correct row.
    // This is why the correct user's info shows — not hardcoded "Tron Francia".
    // ================================
    async function loadProfileFromSupabase() {
        const userEmail = getCurrentUserEmail();
        const userId    = getCurrentUserId();

        // ── Debug: open browser Console (F12) to see these ──
        console.log("🔍 profile_page: currentUserEmail =", userEmail);
        console.log("🔍 profile_page: currentUserId    =", userId);

        // No session — nothing to load
        if (!userEmail && !userId) {
            console.warn("❌ No session found. Make sure login_page saved currentUserEmail to localStorage.");
            return;
        }

        // Show cached data instantly while Supabase fetches
        const cached = localStorage.getItem(getProfileKey());
        if (cached) {
            try { updateProfileDisplay(JSON.parse(cached)); } catch (_) {}
        }

        try {
            const client = getSupabaseClient();

            // ✅ Use email as lookup — always set at login, works for all users
            const { data, error } = await client
                .from("users")
                .select("id, first_name, last_name, email, phone_number, profile_image")
                .eq("email", userEmail || "")
                .single();

            if (error) throw error;

            if (data) {
                // ✅ Save integer id for save/upload operations
                localStorage.setItem("currentUserId",    String(data.id));
                localStorage.setItem("currentUserEmail", data.email || userEmail);

                const normalized = {
                    firstName  : data.first_name    || "",
                    lastName   : data.last_name     || "",
                    email      : data.email         || userEmail || "",
                    contact    : data.phone_number  || "",
                    image      : data.profile_image || "default-profile.png",
                    lastUpdated: new Date().toISOString()
                };

                // ✅ Cache under the correct integer-id key
                localStorage.setItem(
                    "userProfile_" + String(data.id),
                    JSON.stringify(normalized)
                );

                // ✅ Display the REAL logged-in user's info
                updateProfileDisplay(normalized);
            }

        } catch (err) {
            console.warn("Supabase load failed, using cache:", err.message);
            const fallback = localStorage.getItem(getProfileKey());
            if (fallback) {
                try { updateProfileDisplay(JSON.parse(fallback)); } catch (_) {}
            }
        }
    }

    // ================================
    // EDIT / SAVE BUTTON
    // ================================
    editBtn.addEventListener("click", async function () {
        if (!isEditing) {
            toggleInputs(true);
            editBtn.textContent = "💾 Save";
            editBtn.disabled    = false;
            isEditing           = true;
        } else {
            editBtn.disabled    = true;
            editBtn.textContent = "Saving…";
            const success = await saveProfile();
            if (success) {
                toggleInputs(false);
                editBtn.textContent = "✏️ Edit";
                isEditing           = false;
            } else {
                editBtn.textContent = "💾 Save";
            }
            editBtn.disabled = false;
        }
    });

    function toggleInputs(enable) {
        [firstName, lastName, contact].forEach(el => {
            if (el) el.readOnly = !enable;
        });
        // Email always locked
        if (emailField) {
            emailField.readOnly              = true;
            emailField.style.backgroundColor = "#f0f0f0";
            emailField.style.cursor          = "not-allowed";
        }
    }

    // ================================
    // SAVE PROFILE → SUPABASE users TABLE
    // Updates first_name, last_name, phone_number using integer id
    // ================================
    async function saveProfile() {
        const firstVal   = firstName  ? firstName.value.trim()  : "";
        const lastVal    = lastName   ? lastName.value.trim()   : "";
        const contactVal = contact    ? contact.value.trim()    : "";
        const emailVal   = emailField ? emailField.value.trim() : "";

        if (!firstVal || !lastVal) {
            alert("First name and last name are required.");
            return false;
        }

        const userId        = getCurrentUserId();
        const currentImgSrc = profileImage ? profileImage.src : "default-profile.png";

        const localProfile = {
            firstName  : firstVal,
            lastName   : lastVal,
            email      : emailVal,
            contact    : contactVal,
            image      : currentImgSrc,
            lastUpdated: new Date().toISOString()
        };

        try {
            if (userId) {
                const client = getSupabaseClient();
                const { error } = await client
                    .from("users")
                    .update({
                        first_name  : firstVal,
                        last_name   : lastVal,
                        phone_number: contactVal,
                    })
                    .eq("id", Number(userId));   // ✅ integer id

                if (error) throw error;
            }

            localStorage.setItem(getProfileKey(), JSON.stringify(localProfile));

            if (profileNameDisplay)
                profileNameDisplay.textContent = firstVal + " " + lastVal;
            if (sidebarUserName)
                sidebarUserName.textContent = firstVal + " " + lastVal;

            broadcastProfileUpdate(localProfile);
            alert("Profile updated successfully!");
            return true;

        } catch (err) {
            console.error("Save profile error:", err);
            alert("Failed to save profile: " + (err.message || "Please try again."));
            return false;
        }
    }

    // ================================
    // UPLOAD PROFILE IMAGE
    // 1. Upload file to Supabase Storage bucket "profile_image"
    // 2. Get public URL
    // 3. Save URL to users.profile_image column using email lookup
    // 4. Update localStorage cache + sync UI
    // ================================
    async function uploadProfileImage(file) {
        if (!file.type.startsWith("image/")) {
            throw new Error("Please upload a valid image file.");
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("Image is too large. Please choose one under 5MB.");
        }

        const userEmail = getCurrentUserEmail();
        const userId    = getCurrentUserId();

        if (!userEmail) {
            throw new Error("No logged-in user found. Please log in again.");
        }

        const client = getSupabaseClient();

        // ── Unique filename ──
        const rawExt   = file.name.split(".").pop() || "jpg";
        const safeExt  = rawExt.toLowerCase().replace(/[^a-z0-9]/gi, "") || "jpg";
        const fileId   = userId || userEmail.replace(/[^a-z0-9]/gi, "_");
        const fileName = `profile_${fileId}_${Date.now()}.${safeExt}`;

        // ── Upload to Storage ──
        console.log("🔍 Uploading to bucket:", PROFILE_IMAGE_BUCKET, "| file:", fileName);

        const { data: uploadData, error: uploadError } = await client.storage
            .from(PROFILE_IMAGE_BUCKET)
            .upload(fileName, file, {
                cacheControl: "3600",
                upsert      : true,
                contentType : file.type
            });

        console.log("🔍 Upload result:", uploadData, "| error:", uploadError);

        if (uploadError) throw new Error(uploadError.message || "Image upload failed.");

        // ── Get public URL ──
        const { data: urlData } = client.storage
            .from(PROFILE_IMAGE_BUCKET)
            .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error("Unable to get public URL.");

        // ── Save URL to users.profile_image using email ──
        const { error: dbError } = await client
            .from("users")
            .update({ profile_image: publicUrl })
            .eq("email", userEmail);    // ✅ email always available

        if (dbError) {
            console.warn("DB update for profile_image failed:", dbError.message);
        }

        // ── Update localStorage cache ──
        const saved       = JSON.parse(localStorage.getItem(getProfileKey())) || {};
        saved.image       = publicUrl;
        saved.lastUpdated = new Date().toISOString();
        localStorage.setItem(getProfileKey(), JSON.stringify(saved));

        syncProfileImages(publicUrl);
        broadcastProfileUpdate(saved);

        return publicUrl;
    }

    // ================================
    // REMOVE PROFILE IMAGE
    // ================================
    async function removeProfileImage() {
        const defaultImage = "default-profile.png";
        const userEmail    = getCurrentUserEmail();

        try {
            if (userEmail) {
                const client = getSupabaseClient();
                await client
                    .from("users")
                    .update({ profile_image: null })
                    .eq("email", userEmail);    // ✅ email always available
            }
        } catch (err) {
            console.warn("Could not clear profile_image in DB:", err.message);
        }

        const saved       = JSON.parse(localStorage.getItem(getProfileKey())) || {};
        saved.image       = defaultImage;
        saved.lastUpdated = new Date().toISOString();
        localStorage.setItem(getProfileKey(), JSON.stringify(saved));

        syncProfileImages(defaultImage);
        broadcastProfileUpdate(saved);
    }

    // ================================
    // UPLOAD PHOTO OPTION
    // ================================
    document.getElementById("uploadPhotoOption").addEventListener("click", function () {
        imageUpload.click();
        menu.style.display = "none";
    });

    imageUpload.addEventListener("change", async function () {
        const file = this.files[0];
        if (!file) return;
        try {
            await uploadProfileImage(file);
            alert("Profile picture updated successfully!");
        } catch (err) {
            alert("Upload failed: " + err.message);
        }
        this.value = "";
    });

    // ================================
    // REMOVE PHOTO OPTION
    // ================================
    document.getElementById("removePhotoOption").addEventListener("click", async function () {
        menu.style.display = "none";
        if (!confirm("Are you sure you want to remove your profile picture?")) return;
        try {
            await removeProfileImage();
            alert("Profile picture removed.");
        } catch (err) {
            alert("Could not remove picture: " + err.message);
        }
    });

    // ================================
    // MENU HOVER + VIEW LIGHTBOX
    // ================================
    (function menuEnhancements() {
        const uploadOption = document.getElementById("uploadPhotoOption");
        const removeOption = document.getElementById("removePhotoOption");
        const viewOption   = document.getElementById("viewPhotoOption");

        [uploadOption, removeOption, viewOption].forEach(item => {
            item.addEventListener("mouseenter", () => {
                item.style.background = "#cce5ff";
                item.style.transform  = "translateY(-2px)";
                item.style.transition = "all 0.15s ease";
            });
            item.addEventListener("mouseleave", () => {
                item.style.background = "";
                item.style.transform  = "translateY(0)";
            });
        });

        viewOption.addEventListener("click", () => {
            menu.style.display = "none";

            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(0,0,0,0.85);
                display:flex; justify-content:center; align-items:center;
                z-index:2000;
            `;

            const imgContainer = document.createElement("div");
            imgContainer.style.cssText = "position:relative; max-width:95%; max-height:95%;";

            const img = document.createElement("img");
            img.src   = profileImage ? profileImage.src : "default-profile.png";
            img.alt   = "Profile Picture";
            img.style.cssText = "width:100%; height:auto; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5);";

            const closeBtn = document.createElement("div");
            closeBtn.innerHTML = "×";
            closeBtn.style.cssText = `
                position:absolute; top:-10px; right:-10px;
                font-size:35px; color:#fff;
                cursor:pointer; line-height:1; user-select:none;
            `;
            closeBtn.addEventListener("click", () => overlay.remove());

            imgContainer.append(img, closeBtn);
            overlay.appendChild(imgContainer);
            overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);
        });
    })();

    // ================================
    // LOGOUT
    // ================================
    const logoutBtn = document.querySelector(".logout-item");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function (e) {
            e.preventDefault();
            if (confirm("Are you sure you want to logout?")) {
                localStorage.removeItem("currentUserId");
                localStorage.removeItem("currentUserEmail");
                window.location.href = "login_page.html";
            }
        });
    }

    // ================================
    // INITIALIZE
    // ================================
    loadProfileFromSupabase();   // ✅ Load real logged-in user data from Supabase
    listenForProfileChanges();   // ✅ Sync across tabs

});
