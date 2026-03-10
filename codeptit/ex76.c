#include <stdio.h>
#include <math.h>
int ngto(int a){
}
int check(int a,int b){
    while(b!=0){
        int c=a%b;
        a=b;
        b=c;
    }
    int n=0;
    while(a>0){
        n+=a%10;
        a/=10;
    }
    if(n<2)return 0;
    for(int i=2;i<=sqrt(n);i++){
        if(n%i==0)return 0;
    }
    return 1;
}

int main(){
    int t;scanf("%d",&t);
    
    for(int i=0;i<t;i++){
        int a,b;scanf("%d%d",&a,&b);

        if(check(a,b)==1)printf("YES\n");
        else printf("NO\n");
    }
}