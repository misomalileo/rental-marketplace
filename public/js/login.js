document.getElementById("loginForm").addEventListener("submit",async e=>{

e.preventDefault();

const email=document.getElementById("email").value;
const password=document.getElementById("password").value;

const res=await fetch("/api/auth/login",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({email,password})

});

const data=await res.json();

if(!data.token){

alert(data.message);
return;

}

localStorage.setItem("token",data.token);

localStorage.setItem("role",data.user.role);

if(data.user.role==="admin"){

window.location="admin.html";

}else{

window.location="dashboard.html";

}

});