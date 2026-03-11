#include <stdio.h>
#include <math.h>
typedef long long ll;
ll usc(ll a,ll b){
    while(b!=0){
        ll temp=b;//tạm thời
        b=a%b;//phần dư của a:b
        a=temp;//a=b(ban đầu)
    }
return a;
}
ll bsc(ll a,ll b){
return (a*b)/usc(a,b);
}
int main(){
    int t;scanf("%d ",&t);
    for(int i=0;i<t;i++){
        ll a,b;
        scanf("%lld  %lld ",&a,&b);
        printf("%lld  %lld \n",bsc(a,b),usc(a,b));
    }
}