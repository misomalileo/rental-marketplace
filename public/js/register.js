document.getElementById("registerForm")
.addEventListener("submit", async (e)=>{

    e.preventDefault();

    const data = {
        name: name.value,
        email: email.value,
        password: password.value,
        phone: phone.value
    };

    const res = await fetch("/api/auth/register",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(data)
    });

    const result = await res.json();

    alert(result.message);

    window.location.href = "login.html";
});