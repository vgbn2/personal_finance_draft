#include<stdio.h>
typedef long long ll;
ll gt(ll a){
    ll o=a,sum=0;
    while(a>0){
        ll tic=1;
        for(int i=1;i<=a%10;i++){
            tic*=i;
        }
        sum+=tic;
        a/=10;
    }
    return sum==o;
}
int main(){
    int n;scanf("%d",&n);
    for(ll i=1;i<=n;i++){
        if(gt(i))
        printf("%lld ",i);
    }
}