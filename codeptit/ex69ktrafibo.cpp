#include <stdio.h>

int main(){
    unsigned long long n,a=0,b=1,c;
scanf("%lld",&n);
if(n==0||n==1){
    printf("1");
}
while(b<n){
    c=a+b;
    a=b;b=c;
}
if(b==n){
    printf("1");
}
else printf("0");
}
