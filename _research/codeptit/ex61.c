#include <stdio.h>
#include <math.h>
typedef long long ll;

ll usc(ll a,ll b){
    while(b!=0){
        ll tem=b;
        b=a%b;
        a=tem;
    }
    return a;
}
ll bsc(ll a,ll b){
    return (a*b)/(usc(a,b));
}
int main(){
    ll a,b;
    scanf("%lld %lld",&a,&b);
    printf("%lld\n%lld",usc(a,b),bsc(a,b));
}