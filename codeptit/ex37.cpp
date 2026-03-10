#include <stdio.h>
typedef long long ll;
int main(){
    int t;
    scanf("%d",&t);
  for(int i=0;i<t;i++){
        ll n;
        scanf("%lld",&n);
        int prev=10;
        int check=1;
    while(n>0){
        int digit=n%10;
        if(digit>prev){
            check=0;
        }
        prev=digit;
        n/=10;  
    }

if(check){
printf("YES\n");
}
else
printf("NO\n");
    }
}