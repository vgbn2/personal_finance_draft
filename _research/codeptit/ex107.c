#include <stdio.h>
void pr(int ar[1000],int n){
    for(int i=0;i<n;i++){
        printf("%d ",ar[i]);
    }
    printf("\n");
}
int main(){
    int ar[1000],br[1000]={0},cr[1000]={0},count1=0,count2=0;
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        scanf("%d",&ar[i]);
    }
    for(int i=0;i<t;i++){
        if(ar[i]%2==0){
            br[count1++]=ar[i];
        }
        else {
            cr[count2++]=ar[i];
    }
}
pr(br,count1);
pr(cr,count2);

}